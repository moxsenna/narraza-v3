import {
  createPaidGenerationPreparationService,
  MOCK_PRICE_SNAPSHOT_FIXTURES,
  MOCK_PRICE_SNAPSHOT_ID,
  MOCK_WRITER_MODEL_ID,
  seedMockPriceSnapshots,
  type ContextPacketLike,
} from '@narraza/application';
import { dependency } from '@narraza/core';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork } from '../unit-of-work.js';

/**
 * M4 Block B `request-beat-snapshot` (S4/S5/S9) — real PostgreSQL.
 *
 * The bundle and the workflow plan are frozen BEFORE the CreditQuote exists,
 * the quote carries the exact frozen hashes/ids, and later source mutations
 * never rewrite an old bundle/plan: a new request after a dependency change
 * sees a new dependency hash while the first artifacts stay byte-identical.
 */

const schema = createSchemaTestSuite();
const { buildDependencyManifest, dependencyManifestHash } = dependency;

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

function packetsFor(
  projectId: string,
  dependencyHash: string,
  factRevision: number,
): ContextPacketLike[] {
  return [
    {
      kind: 'writer',
      dataClass: 'writer_safe',
      metadata: { projectId, dependencyHash, schemaVersion: 1 },
      beatContract: { chapterNumber: 3, sequence: 9 },
      establishedFacts: [{ factId: 'fact-1', revision: factRevision }],
    },
    {
      kind: 'validator',
      dataClass: 'author_private',
      metadata: { projectId, dependencyHash, schemaVersion: 1 },
      restrictedGuardSets: [{ guardId: 'guard-1' }],
    },
    {
      kind: 'repair',
      dataClass: 'writer_safe',
      metadata: { projectId, dependencyHash, schemaVersion: 1 },
      content: { recoveryFor: 'beat_write_judge' },
    },
  ];
}

async function prepare(
  unitOfWork: Parameters<typeof createPaidGenerationPreparationService>[0]['unitOfWork'],
  overrides: {
    factRevision: number;
    issuanceRequestId: string;
    bundleId: string;
    planId: string;
  },
) {
  const entries = [
    { entityType: 'chapter', entityId: 'ch-3', revision: overrides.factRevision, deleted: false },
  ];
  const service = createPaidGenerationPreparationService({ unitOfWork });
  return service.prepare({
    projectId: ids.projectA,
    workflowKind: 'beat_write_judge',
    bundleId: overrides.bundleId,
    planId: overrides.planId,
    bundle: {
      dependencyEntries: entries,
      packets: packetsFor(
        ids.projectA,
        dependencyManifestHash(buildDependencyManifest(entries)),
        overrides.factRevision,
      ),
    },
    profile: PROFILE,
    priceSnapshots: MOCK_PRICE_SNAPSHOT_FIXTURES.map((fixture) => ({
      id: fixture.id,
      inputRateMicroIdr: fixture.inputRateMicroIdr,
      outputRateMicroIdr: fixture.outputRateMicroIdr,
    })),
    userId: ids.userA,
    actionKind: 'concept_generation',
    issuanceRequestId: overrides.issuanceRequestId,
  });
}

schema.test('request-beat-snapshot', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await seedMockPriceSnapshots(await createUnitOfWork(createPrismaForUrl(databaseUrl)));
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);

  try {
    const first = await prepare(unitOfWork, {
      factRevision: 4,
      issuanceRequestId: 'req-rbs-1',
      bundleId: 'rbs-bundle-1',
      planId: 'rbs-plan-1',
    });
    expect(first.kind).toBe('prepared');
    if (first.kind !== 'prepared') throw new Error('unreachable');
    const { bundle, quote } = first;
    const planHash = first.planHash;

    // Quote carries the EXACT frozen hashes/ids and the worst-case budget.
    expect(quote.workflowPlanId).toBe(first.planRecordId);
    expect(quote.workflowPlanHash).toBe(planHash);
    expect(quote.dependencyHash).toBe(bundle.dependencyHash);
    expect(quote.maxAmountMicroIdr).toBe(first.plan.estimatedMaxMicroIdr);
    // The frozen template now expands beat_write_judge to five stages with
    // per-stage invocation caps: writer 2, judge 1, and the three repair
    // stages 1 each — 6 worst-case calls. (500*20 + 200*60) = 22_000 per
    // call x 6 = 132_000.
    expect(quote.maxAmountMicroIdr).toBe(132_000n);
    expect(quote.requestId).toBe('req-rbs-1');

    // Freeze ordering: bundle and plan rows exist BEFORE the quote row.
    const ordering = (
      await client.query(
        `SELECT
           (SELECT created_at FROM generation_context_bundles WHERE id = $1) AS bundle_at,
           (SELECT created_at FROM ai_workflow_plans WHERE id = $2) AS plan_at,
           (SELECT created_at FROM credit_quotes WHERE id = $3) AS quote_at`,
        [bundle.bundleId, first.planRecordId, quote.id],
      )
    ).rows[0];
    expect(ordering.bundle_at <= ordering.plan_at).toBe(true);
    expect(ordering.plan_at <= ordering.quote_at).toBe(true);

    // The frozen plan payload names the exact bundle and both stage keys.
    const planRow = (
      await client.query(
        `SELECT bundle_id, workflow_kind, payload FROM ai_workflow_plans WHERE id = $1`,
        [first.planRecordId],
      )
    ).rows[0];
    expect(planRow.bundle_id).toBe(bundle.bundleId);
    expect(planRow.payload.workflowKind).toBe('beat_write_judge');
    expect(planRow.payload.stages.map((stage: { stageKey: string }) => stage.stageKey)).toEqual([
      'writer',
      'writer_parse_repair',
      'judge',
      'judge_parse_repair',
      'judge_repair',
    ]);

    // Later source mutation: a NEW request freezes NEW artifacts and gets a
    // NEW dependency hash; the old bundle/plan are never rewritten.
    const oldBundleRows = await client.query(
      `SELECT * FROM generation_context_bundles WHERE id = $1`,
      [bundle.bundleId],
    );
    const oldPlanRows = await client.query(`SELECT * FROM ai_workflow_plans WHERE id = $1`, [
      first.planRecordId,
    ]);

    const second = await prepare(unitOfWork, {
      factRevision: 5,
      issuanceRequestId: 'req-rbs-2',
      bundleId: 'rbs-bundle-2',
      planId: 'rbs-plan-2',
    });
    expect(second.kind).toBe('prepared');
    if (second.kind !== 'prepared') throw new Error('unreachable');
    expect(second.bundle.dependencyHash).not.toBe(bundle.dependencyHash);
    expect(second.planHash).not.toBe(planHash);
    expect(second.bundle.bundleId).toBe('rbs-bundle-2');
    // The plan is bound to its input: same template over a changed dependency
    // state is a DIFFERENT frozen plan.
    expect(second.quote.dependencyHash).toBe(second.bundle.dependencyHash);

    expect(
      (
        await client.query(`SELECT * FROM generation_context_bundles WHERE id = $1`, [
          bundle.bundleId,
        ])
      ).rows,
    ).toEqual(oldBundleRows.rows);
    expect(
      (await client.query(`SELECT * FROM ai_workflow_plans WHERE id = $1`, [first.planRecordId]))
        .rows,
    ).toEqual(oldPlanRows.rows);
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM ai_workflow_plans`)).rows[0].count,
    ).toBe(2);

    // Exact replay of the SAME issuance request replays the M3 quote and
    // collapses onto the same bundle/plan — no third artifacts.
    const replay = await prepare(unitOfWork, {
      factRevision: 5,
      issuanceRequestId: 'req-rbs-2',
      bundleId: 'rbs-bundle-2',
      planId: 'rbs-plan-2',
    });
    expect(replay.kind).toBe('replayed');
    if (replay.kind !== 'replayed') throw new Error('unreachable');
    expect(replay.quote.id).toBe(second.quote.id);
    expect(
      (await client.query(`SELECT count(*)::int AS count FROM generation_context_bundles`)).rows[0]
        .count,
    ).toBe(2);
  } finally {
    await prisma.$disconnect();
  }
});
