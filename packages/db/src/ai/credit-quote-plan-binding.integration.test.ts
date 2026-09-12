import {
  createCreditQuoteConfirmationService,
  createPaidGenerationPreparationService,
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  MOCK_PRICE_SNAPSHOT_ID,
  MOCK_WRITER_MODEL_ID,
  seedMockPriceSnapshots,
  type ContextPacketLike,
  type UnitOfWork,
} from '@narraza/application';
import { dependency } from '@narraza/core';
import { expect } from 'vitest';
import type { Pool } from 'pg';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

/**
 * M4 Block B `credit-quote-plan-binding` (S5/S9) — real PostgreSQL.
 *
 * The quote's plan is the EXACT plan bound to the job, over the exact bundle
 * and dependency hash. Hash mismatch fails closed, a wrong project never
 * enumerates, replay stays exact — and all of it runs through the EXISTING
 * M3 Task 6 confirmation service, whose semantics are untouched.
 */

const schema = createSchemaTestSuite();
const { buildDependencyManifest, dependencyManifestHash } = dependency;

function repairRecovery(projectId: string, dependencyHash: string): ContextPacketLike {
  const envelope: ContextPacketLike = {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: { projectId: ids.projectA, dependencyHash, schemaVersion: 1 },
  };
  return { ...envelope, content: { recoveryFor: 'beat_write_judge' } };
}

const PROFILE = {
  providerId: 'mock',
  requestedModelId: MOCK_WRITER_MODEL_ID,
  resolvedModelId: MOCK_WRITER_MODEL_ID,
  structuredOutput: true,
  timeoutMs: 30_000,
  maxInputTokens: 500,
  maxOutputTokens: 200,
  priceSnapshotId: `${MOCK_PRICE_SNAPSHOT_ID}-writer`,
  maxInvocations: 2,
} as const;

interface Prepared {
  unitOfWork: UnitOfWork;
  planRecordId: string;
  planHash: string;
  bundleId: string;
  bundleHash: string;
  dependencyHash: string;
  quoteId: string;
  maxAmountMicroIdr: bigint;
}

async function seedAndPrepare(
  client: Pool,
  databaseUrl: string,
  issuanceRequestId: string,
): Promise<Prepared> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('cqb-grant-1',$1,'grant','credit',200000,'cqb-grant-dedupe-1',now())`,
    [ids.userA],
  );
  const unitOfWork = createUnitOfWork(createPrismaForUrl(databaseUrl));
  await seedMockPriceSnapshots(unitOfWork);
  const entries = [{ entityType: 'chapter', entityId: 'ch-3', revision: 4, deleted: false }];
  const dependencyHash = dependencyManifestHash(buildDependencyManifest(entries));
  const service = createPaidGenerationPreparationService({ unitOfWork });
  const result = await service.prepare({
    projectId: ids.projectA,
    workflowKind: 'beat_write_judge',
    bundleId: 'cqb-bundle-1',
    planId: 'cqb-plan-1',
    bundle: {
      dependencyEntries: entries,
      packets: [
        {
          kind: 'writer',
          dataClass: 'writer_safe',
          metadata: { projectId: ids.projectA, dependencyHash, schemaVersion: 1 },
        },
        {
          kind: 'validator',
          dataClass: 'author_private',
          metadata: { projectId: ids.projectA, dependencyHash, schemaVersion: 1 },
        },
        repairRecovery(ids.projectA, dependencyHash),
      ] satisfies ContextPacketLike[],
    },
    profile: PROFILE,
    priceSnapshots: MOCK_PRICE_SNAPSHOT_FIXTURES.map((fixture) => ({
      id: fixture.id,
      inputRateMicroIdr: fixture.inputRateMicroIdr,
      outputRateMicroIdr: fixture.outputRateMicroIdr,
    })),
    userId: ids.userA,
    actionKind: 'concept_generation',
    issuanceRequestId,
  });
  if (result.kind !== 'prepared') throw new Error(`prepare failed: ${JSON.stringify(result)}`);
  return {
    unitOfWork,
    planRecordId: result.planRecordId,
    planHash: result.planHash,
    bundleId: result.bundle.bundleId,
    bundleHash: result.bundle.bundleHash,
    dependencyHash: result.bundle.dependencyHash,
    quoteId: result.quote.id,
    maxAmountMicroIdr: result.quote.maxAmountMicroIdr,
  };
}

schema.test('credit-quote-plan-binding', async ({ client, databaseUrl }) => {
  const prepared = await seedAndPrepare(client, databaseUrl, 'req-cqb-1');
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    // Confirm through the EXISTING M3 Task 6 service.
    const confirmation = createCreditQuoteConfirmationService(prepared.unitOfWork);
    const confirmed = await confirmation.confirmQuote({
      userId: ids.userA,
      projectId: ids.projectA,
      quoteId: prepared.quoteId,
      confirmationRequestId: 'confirm-cqb-1',
      expectedWorkflowPlanHash: prepared.planHash,
      expectedDependencyHash: prepared.dependencyHash,
      reservationId: 'cqb-reservation-1',
      jobId: 'cqb-job-1',
      jobKind: 'concept_generation',
      bundleId: prepared.bundleId,
      workflowPlanId: prepared.planRecordId,
      payload: {},
    });
    expect(confirmed).toMatchObject({ kind: 'confirmed' });

    // The job is bound to the exact plan the quote referenced — same plan id,
    // same plan hash, same bundle, same dependency hash, same quote amount.
    const jobRow = (
      await client.query(
        `SELECT j.workflow_plan_id, j.bundle_id, j.reservation_id,
                p.plan_hash, p.bundle_id AS plan_bundle_id,
                q.workflow_plan_hash, q.dependency_hash, q.max_amount_micro_idr
           FROM generation_jobs j
           JOIN ai_workflow_plans p ON p.project_id = j.project_id AND p.id = j.workflow_plan_id
           JOIN credit_quotes q ON q.id = $1
          WHERE j.project_id = $2 AND j.id = 'cqb-job-1'`,
        [prepared.quoteId, ids.projectA],
      )
    ).rows[0];
    expect(jobRow.workflow_plan_id).toBe(prepared.planRecordId);
    expect(jobRow.plan_hash).toBe(prepared.planHash);
    expect(jobRow.plan_bundle_id).toBe(prepared.bundleId);
    expect(jobRow.bundle_id).toBe(prepared.bundleId);
    expect(jobRow.workflow_plan_hash).toBe(prepared.planHash);
    expect(jobRow.dependency_hash).toBe(prepared.dependencyHash);
    expect(BigInt(jobRow.max_amount_micro_idr)).toBe(prepared.maxAmountMicroIdr);
    expect(jobRow.reservation_id).toBe('cqb-reservation-1');

    // A second request over the SAME semantic input replays to the same
    // bundle/plan but issues a FRESH unconsumed quote.
    const service = createPaidGenerationPreparationService({ unitOfWork: prepared.unitOfWork });
    const entries = [{ entityType: 'chapter', entityId: 'ch-3', revision: 4, deleted: false }];
    const dependencyHash = dependencyManifestHash(buildDependencyManifest(entries));
    const secondQuote = await service.prepare({
      projectId: ids.projectA,
      workflowKind: 'beat_write_judge',
      bundleId: 'cqb-bundle-1',
      planId: 'cqb-plan-1',
      bundle: {
        dependencyEntries: entries,
        packets: [
          {
            kind: 'writer',
            dataClass: 'writer_safe',
            metadata: { projectId: ids.projectA, dependencyHash, schemaVersion: 1 },
          },
          {
            kind: 'validator',
            dataClass: 'author_private',
            metadata: { projectId: ids.projectA, dependencyHash, schemaVersion: 1 },
          },
          repairRecovery(ids.projectA, dependencyHash),
        ] satisfies ContextPacketLike[],
      },
      profile: PROFILE,
      priceSnapshots: MOCK_PRICE_SNAPSHOT_FIXTURES.map((fixture) => ({
        id: fixture.id,
        inputRateMicroIdr: fixture.inputRateMicroIdr,
        outputRateMicroIdr: fixture.outputRateMicroIdr,
      })),
      userId: ids.userA,
      actionKind: 'concept_generation',
      issuanceRequestId: 'req-cqb-2',
    });
    expect(secondQuote.kind).toBe('prepared');
    if (secondQuote.kind !== 'prepared') throw new Error('unreachable');
    expect(secondQuote.quote.id).not.toBe(prepared.quoteId);
    expect(secondQuote.planHash).toBe(prepared.planHash);

    // Hash mismatch fails closed: a confirmation claiming a different plan
    // hash cannot consume the quote.
    const mismatch = await confirmation.confirmQuote({
      userId: ids.userA,
      projectId: ids.projectA,
      quoteId: secondQuote.quote.id,
      confirmationRequestId: 'confirm-cqb-2',
      expectedWorkflowPlanHash: 'f'.repeat(64),
      expectedDependencyHash: prepared.dependencyHash,
      reservationId: 'cqb-reservation-2',
      jobId: 'cqb-job-2',
      jobKind: 'concept_generation',
      bundleId: prepared.bundleId,
      workflowPlanId: prepared.planRecordId,
      payload: {},
    });
    expect(mismatch).toEqual({ kind: 'hash_mismatch', field: 'workflowPlanHash' });

    // Exact replay: same confirmation request replays the same reservation
    // and job — no second job, no second reservation.
    const replay = await confirmation.confirmQuote({
      userId: ids.userA,
      projectId: ids.projectA,
      quoteId: prepared.quoteId,
      confirmationRequestId: 'confirm-cqb-1',
      expectedWorkflowPlanHash: prepared.planHash,
      expectedDependencyHash: prepared.dependencyHash,
      reservationId: 'cqb-reservation-1',
      jobId: 'cqb-job-1',
      jobKind: 'concept_generation',
      bundleId: prepared.bundleId,
      workflowPlanId: prepared.planRecordId,
      payload: {},
    });
    expect(replay.kind).toBe('exact_replay');
    if (replay.kind !== 'exact_replay') throw new Error('unreachable');
    expect(replay.job.id).toBe('cqb-job-1');
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM generation_jobs`)).rows[0].count,
    ).toBe(1);
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM credit_reservations`)).rows[0].count,
    ).toBe(1);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  'credit-quote-plan-binding wrong project fails non-enumerating',
  async ({ client, databaseUrl }) => {
    const prepared = await seedAndPrepare(client, databaseUrl, 'req-cqb-p2');
    const prisma = createPrismaForUrl(databaseUrl);

    try {
      const confirmation = createCreditQuoteConfirmationService(prepared.unitOfWork);
      // A different project cannot even see the quote: not_found, not details.
      const wrongProject = await confirmation.confirmQuote({
        userId: ids.userA,
        projectId: ids.projectB,
        quoteId: prepared.quoteId,
        confirmationRequestId: 'confirm-cqb-wrong',
        expectedWorkflowPlanHash: prepared.planHash,
        expectedDependencyHash: prepared.dependencyHash,
        reservationId: 'cqb-reservation-wrong',
        jobId: 'cqb-job-wrong',
        jobKind: 'concept_generation',
        bundleId: prepared.bundleId,
        workflowPlanId: prepared.planRecordId,
        payload: {},
      });
      expect(wrongProject).toEqual({ kind: 'not_found' });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM generation_jobs`)).rows[0].count,
      ).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);
