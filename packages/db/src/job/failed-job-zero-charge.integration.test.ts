import {
  createJobService,
  createThreePhaseAttemptHarness,
  createWorkflowInvocationService,
} from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createProjectRepo } from '../repos/project-repo.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedPlanningGraph, seedUsersAndProjects } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  insertReservationBinding,
  leaseTokens,
} from './job-test-fixtures.js';

const suite = createSchemaTestSuite();
const JOB_ID = '7e000000-0000-4000-8000-000000000011';
const RESERVATION_ID = '7e100000-0000-4000-8000-000000000011';
const INVOCATION_ID = 'task11-invocation';
const ATTEMPT_ID = 'task11-attempt';
const PRICE_ID = 'task11-price';
const CANDIDATE_ID = 'task11-candidate';
const PROSE_VERSION_ID = 'task11-prose-version';
const RESULT_HASH = 'c'.repeat(64);

const usage = {
  priceSnapshotId: PRICE_ID,
  inputTokens: 11,
  outputTokens: 7,
  providerCostMicroIdr: 180n,
} as const;

async function seedBoundJob(
  client: Pool,
  options: {
    fundingModel?: 'user_paid' | 'system_funded';
    kind?: string;
    planningGraph?: boolean;
  } = {},
) {
  const fundingModel = options.fundingModel ?? 'user_paid';
  await (options.planningGraph ? seedPlanningGraph(client) : seedUsersAndProjects(client));
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('task11-opening-grant',$1,$2,NULL,NULL,'grant','credit',5000,'task11-opening-grant',now())`,
    [ids.userA, ids.projectA],
  );
  await insertQueuedJobRow(client, {
    id: JOB_ID,
    projectId: ids.projectA,
    kind: options.kind ?? (fundingModel === 'system_funded' ? 'chat_intake' : 'scene_generation'),
  });
  await insertReservationBinding(client, {
    reservationId: RESERVATION_ID,
    jobId: JOB_ID,
    projectId: ids.projectA,
    userId: ids.userA,
    reservedMicroIdr: 1_000n,
  });
  await client.query(
    `UPDATE credit_reservations
        SET job_project_id=$1,funding_model=$2
      WHERE id=$3`,
    [ids.projectA, fundingModel, RESERVATION_ID],
  );
  await client.query(
    `INSERT INTO model_price_snapshots
       (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,
        output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
     VALUES ($1,'provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    [PRICE_ID],
  );
}

async function ledgerSnapshot(client: Pool) {
  return client.query(`SELECT * FROM credit_ledger ORDER BY id`);
}

async function financialSnapshot(client: Pool) {
  return (
    await client.query(
      `SELECT j.status AS job_status,
              r.status AS reservation_status,
              r.settled_micro_idr::text AS settled,
              r.released_micro_idr::text AS released,
              r.exposure_micro_idr::text AS exposure,
              (SELECT count(*)::int FROM credit_ledger
                WHERE reservation_id=$1 AND entry_type='reservation_settlement') AS settlements,
              (SELECT count(*)::int FROM credit_ledger
                WHERE reservation_id=$1 AND entry_type='release') AS releases,
              (SELECT count(*)::int FROM credit_ledger
                WHERE amount_micro_idr=0) AS zero_ledger,
              (SELECT count(*)::int FROM credit_billing_allocations
                WHERE reservation_id=$1) AS allocations,
              (SELECT COALESCE(sum(CASE
                  WHEN direction='credit' AND entry_type IN ('grant','refund','adjustment') THEN amount_micro_idr
                  WHEN direction='debit' AND entry_type IN ('charge','reservation_settlement','adjustment') THEN -amount_micro_idr
                  ELSE 0 END),0)::text
                 FROM credit_ledger WHERE user_id=$2) AS book,
              (SELECT count(*)::int FROM ai_usage_events
                WHERE attempt_id=$3 AND charged_party='system') AS system_usage
         FROM generation_jobs j
         JOIN credit_reservations r ON r.id=j.reservation_id
        WHERE j.id=$4`,
      [RESERVATION_ID, ids.userA, ATTEMPT_ID, JOB_ID],
    )
  ).rows[0];
}

function createHarness(
  databaseUrl: string,
  executorStatus: 'succeeded' | 'failed',
  validator: 'valid' | 'invalid',
) {
  const prisma = createPrismaForUrl(databaseUrl);
  const unitOfWork = createUnitOfWork(prisma);
  const jobs = createJobService(unitOfWork);
  const workflow = createWorkflowInvocationService(unitOfWork);
  const harness = createThreePhaseAttemptHarness({
    workflow,
    jobs,
    executor: async () => ({
      kind: 'billable',
      status: executorStatus,
      providerRequestId: 'task11-provider-request',
      resultHash: executorStatus === 'succeeded' ? RESULT_HASH : null,
      schemaVersion: 1,
      payload: { provider: executorStatus },
      usage,
    }),
    validator: async () =>
      validator === 'valid'
        ? { kind: 'valid' as const }
        : { kind: 'invalid' as const, errorCode: 'validator_rejected' },
  });
  return { prisma, jobs, workflow, harness };
}

suite.test(
  'failed-job-zero-charge: billable provider failure retains system liability and releases paid hold once',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    const { prisma, jobs, harness } = createHarness(databaseUrl, 'failed', 'valid');
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      await expect(
        harness.run({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_ID,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { input: true },
        }),
      ).resolves.toMatchObject({ kind: 'finalized_without_publish' });
      await expect(jobs.finish({ ...claim.identity, status: 'failed' })).resolves.toMatchObject({
        kind: 'terminalized',
        job: { status: 'failed' },
      });

      expect(await financialSnapshot(client)).toEqual({
        job_status: 'failed',
        reservation_status: 'released',
        settled: '0',
        released: '1000',
        exposure: '0',
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
        system_usage: 1,
      });

      const reservationBeforeReplay = await client.query(
        `SELECT * FROM credit_reservations WHERE id=$1`,
        [RESERVATION_ID],
      );
      const ledgerBeforeReplay = await ledgerSnapshot(client);
      await expect(
        createWorkflowInvocationService(createUnitOfWork(prisma)).finalizeAttempt({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_ID,
          status: 'failed',
          providerRequestId: 'task11-provider-request',
          resultHash: null,
          schemaVersion: 1,
          payload: { provider: 'failed' },
          usage,
        }),
      ).resolves.toMatchObject({ kind: 'replayed', winner: 'ineligible_owner' });
      expect(
        await client.query(`SELECT * FROM credit_reservations WHERE id=$1`, [RESERVATION_ID]),
      ).toEqual(reservationBeforeReplay);
      expect(await ledgerSnapshot(client)).toEqual(ledgerBeforeReplay);
      expect(await financialSnapshot(client)).toMatchObject({
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        system_usage: 1,
      });

      await expect(jobs.finish({ ...claim.identity, status: 'failed' })).resolves.toEqual({
        kind: 'already_terminal',
        status: 'failed',
      });
      expect((await financialSnapshot(client)).releases).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'failed-job-zero-charge: successful winner rejected by validator has no durable output allocation or settlement',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    const { prisma, jobs, harness } = createHarness(databaseUrl, 'succeeded', 'invalid');
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        harness.run({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_ID,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { input: true },
        }),
      ).resolves.toEqual({ kind: 'validation_failed', errorCode: 'validator_rejected' });
      await jobs.finish({ ...claim.identity, status: 'failed' });

      expect(await financialSnapshot(client)).toMatchObject({
        job_status: 'failed',
        reservation_status: 'released',
        settled: '0',
        released: '1000',
        exposure: '0',
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
        system_usage: 1,
      });
      expect(
        (
          await client.query(`SELECT winner_attempt_id FROM workflow_invocations WHERE id=$1`, [
            INVOCATION_ID,
          ])
        ).rows,
      ).toEqual([{ winner_attempt_id: ATTEMPT_ID }]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'failed-job-zero-charge: dead terminal path fully releases with no user settlement',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    const { prisma, jobs } = createHarness(databaseUrl, 'failed', 'valid');
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(jobs.finish({ ...claim.identity, status: 'dead' })).resolves.toMatchObject({
        kind: 'terminalized',
        job: { status: 'dead' },
      });
      expect(await financialSnapshot(client)).toMatchObject({
        job_status: 'dead',
        reservation_status: 'released',
        settled: '0',
        released: '1000',
        exposure: '0',
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'failed-job-zero-charge: running cancel fences late provider result from publication and full-releases once',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const jobs = createJobService(unitOfWork);
    const workflow = createWorkflowInvocationService(unitOfWork);
    let releaseExecutor!: () => void;
    let executorEntered!: () => void;
    const executorGate = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      executorEntered = resolve;
    });
    let validatorCalls = 0;
    const harness = createThreePhaseAttemptHarness({
      workflow,
      jobs,
      executor: async () => {
        executorEntered();
        await executorGate;
        return {
          kind: 'billable',
          status: 'succeeded',
          providerRequestId: 'task11-late-cancel',
          resultHash: RESULT_HASH,
          schemaVersion: 1,
          payload: { late: true },
          usage,
        } as const;
      },
      validator: async () => {
        validatorCalls++;
        return { kind: 'valid' };
      },
    });
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      const running = harness.run({
        ...claim.identity,
        invocationId: INVOCATION_ID,
        attemptId: ATTEMPT_ID,
        stageKey: 'writer',
        schemaVersion: 1,
        payload: { input: true },
      });
      await entered;
      await expect(jobs.cancel({ projectId: ids.projectA, jobId: JOB_ID })).resolves.toEqual({
        kind: 'cancellation_requested',
      });
      releaseExecutor();
      await expect(running).resolves.toMatchObject({
        kind: 'finalized_without_publish',
        winner: 'cancelled',
      });
      expect(validatorCalls).toBe(0);
      await client.query(
        `UPDATE generation_jobs
            SET lease_expires_at=clock_timestamp()-interval '1 second'
          WHERE id=$1`,
        [JOB_ID],
      );
      await expect(jobs.reclaimOne({})).resolves.toMatchObject({
        kind: 'cancelled',
        job: { status: 'cancelled' },
      });

      expect(await financialSnapshot(client)).toMatchObject({
        job_status: 'cancelled',
        reservation_status: 'cancelled',
        settled: '0',
        released: '1000',
        exposure: '0',
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
        system_usage: 1,
      });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM outbox_events`)).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      releaseExecutor();
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'failed-job-zero-charge: tombstone after winner denies publication and terminal failure cannot charge user',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const jobs = createJobService(unitOfWork);
    let releaseValidator!: () => void;
    let validatorEntered!: () => void;
    const validatorGate = new Promise<void>((resolve) => {
      releaseValidator = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      validatorEntered = resolve;
    });
    const harness = createThreePhaseAttemptHarness({
      workflow: createWorkflowInvocationService(unitOfWork),
      jobs,
      executor: async () => ({
        kind: 'billable',
        status: 'succeeded',
        providerRequestId: 'task11-tombstone-result',
        resultHash: RESULT_HASH,
        schemaVersion: 1,
        payload: { candidate: true },
        usage,
      }),
      validator: async () => {
        validatorEntered();
        await validatorGate;
        return { kind: 'valid' };
      },
    });
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      const running = harness.run({
        ...claim.identity,
        invocationId: INVOCATION_ID,
        attemptId: ATTEMPT_ID,
        stageKey: 'writer',
        schemaVersion: 1,
        payload: { input: true },
      });
      await entered;
      await prisma.$transaction(async (tx) => {
        await createProjectRepo(tx).lockForUpdate(ids.projectA);
        await tx.$executeRaw`UPDATE projects SET deleted_at=now() WHERE id=${ids.projectA}`;
      });
      releaseValidator();
      await expect(running).resolves.toEqual({
        kind: 'publish_denied',
        outcome: 'project_tombstoned',
      });
      await jobs.finish({ ...claim.identity, status: 'failed' });

      expect(await financialSnapshot(client)).toMatchObject({
        job_status: 'failed',
        reservation_status: 'released',
        settled: '0',
        released: '1000',
        settlements: 0,
        releases: 1,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
        system_usage: 1,
      });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM outbox_events`)).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      releaseValidator();
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'failed-job-zero-charge: system-funded successful usable output publishes with zero user charge',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client, { fundingModel: 'system_funded', planningGraph: true });
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const jobs = createJobService(unitOfWork);
    const harness = createThreePhaseAttemptHarness({
      workflow: createWorkflowInvocationService(unitOfWork),
      jobs,
      executor: async () => ({
        kind: 'billable',
        status: 'succeeded',
        providerRequestId: 'task11-system-success',
        resultHash: RESULT_HASH,
        schemaVersion: 1,
        payload: { usable: true },
        usage,
      }),
      validator: async () => {
        await client.query(
          `INSERT INTO proposal_groups
             (id,project_id,kind,status,dependency_hash,created_at,updated_at)
           VALUES ('task11-group',$1,'prose','pending',$2,now(),now())`,
          [ids.projectA, 'd'.repeat(64)],
        );
        await client.query(
          `INSERT INTO generated_candidates
             (id,project_id,group_id,job_id,ordinal,schema_version,payload,created_at)
           VALUES ($1,$2,'task11-group',$3,0,1,$4::jsonb,now())`,
          [
            CANDIDATE_ID,
            ids.projectA,
            JOB_ID,
            JSON.stringify({ contributingAttemptIds: [ATTEMPT_ID] }),
          ],
        );
        await client.query(
          `INSERT INTO prose_versions
             (id,project_id,beat_id,source_candidate_id,status,revision,content,content_hash,created_at)
           VALUES ($1,$2,$3,$4,'draft',0,'task11 usable prose',$5,now())`,
          [PROSE_VERSION_ID, ids.projectA, ids.beatA, CANDIDATE_ID, 'e'.repeat(64)],
        );
        await client.query(`UPDATE generated_candidates SET prose_version_id=$1 WHERE id=$2`, [
          PROSE_VERSION_ID,
          CANDIDATE_ID,
        ]);
        return { kind: 'valid' as const };
      },
    });
    try {
      const ledgerBefore = await ledgerSnapshot(client);
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      await expect(
        harness.run({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_ID,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { input: true },
        }),
      ).resolves.toMatchObject({ kind: 'published', job: { status: 'succeeded' } });

      expect(await financialSnapshot(client)).toEqual({
        job_status: 'succeeded',
        reservation_status: 'released',
        settled: '0',
        released: '1000',
        exposure: '0',
        settlements: 0,
        releases: 0,
        zero_ledger: 0,
        allocations: 0,
        book: '5000',
        system_usage: 1,
      });
      expect(await ledgerSnapshot(client)).toEqual(ledgerBefore);
      expect(
        (
          await client.query(
            `SELECT gc.prose_version_id,pv.source_candidate_id,gc.payload
               FROM generated_candidates gc
               JOIN prose_versions pv ON pv.id=gc.prose_version_id
              WHERE gc.id=$1`,
            [CANDIDATE_ID],
          )
        ).rows,
      ).toEqual([
        {
          prose_version_id: PROSE_VERSION_ID,
          source_candidate_id: CANDIDATE_ID,
          payload: { contributingAttemptIds: [ATTEMPT_ID] },
        },
      ]);
      expect(
        (
          await client.query(
            `SELECT attempt_id,price_snapshot_id,input_tokens,output_tokens,
                    provider_cost_micro_idr::text,charged_party,dedupe_key
               FROM ai_usage_events WHERE attempt_id=$1`,
            [ATTEMPT_ID],
          )
        ).rows,
      ).toEqual([
        {
          attempt_id: ATTEMPT_ID,
          price_snapshot_id: PRICE_ID,
          input_tokens: 11,
          output_tokens: 7,
          provider_cost_micro_idr: '180',
          charged_party: 'system',
          dedupe_key: `usage:${ATTEMPT_ID}`,
        },
      ]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

for (const terminal of ['failed', 'cancelled'] as const) {
  suite.test(
    `failed-job-zero-charge: system-funded ${terminal} retains provider liability with byte-identical user book`,
    async ({ client, databaseUrl }) => {
      await seedBoundJob(client, { fundingModel: 'system_funded' });
      const { prisma, jobs, harness } = createHarness(databaseUrl, 'failed', 'valid');
      try {
        const before = await client.query(`SELECT * FROM credit_ledger ORDER BY id`);
        const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
        if (claim.kind !== 'claimed') throw new Error('job not claimed');
        await harness.run({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_ID,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { input: true },
        });
        if (terminal === 'cancelled') {
          await jobs.cancel({ projectId: ids.projectA, jobId: JOB_ID });
        }
        await jobs.finish({ ...claim.identity, status: terminal });

        expect(await financialSnapshot(client)).toMatchObject({
          job_status: terminal,
          reservation_status: terminal === 'cancelled' ? 'cancelled' : 'released',
          settled: '0',
          released: '1000',
          exposure: '0',
          settlements: 0,
          releases: 0,
          zero_ledger: 0,
          allocations: 0,
          book: '5000',
          system_usage: 1,
        });
        expect(await client.query(`SELECT * FROM credit_ledger ORDER BY id`)).toEqual(before);
      } finally {
        await prisma.$disconnect();
      }
    },
  );
}

suite.test(
  'failed-job-zero-charge: immutable usable-output allocation survives later failed terminal label',
  async ({ client, databaseUrl }) => {
    await seedBoundJob(client);
    await client.query(
      `INSERT INTO workflow_invocations
         (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at)
       VALUES ($1,$2,$3,'writer','running',NULL,0,now(),now())`,
      [INVOCATION_ID, ids.projectA, JOB_ID],
    );
    await client.query(
      `INSERT INTO generation_attempts
         (id,project_id,job_id,invocation_id,ordinal,status,provider_request_id,result_hash,
          started_at,finished_at,schema_version,payload,created_at,updated_at)
       VALUES ($1,$2,$3,$4,0,'succeeded','task11-provider',$5,now(),now(),1,'{}',now(),now())`,
      [ATTEMPT_ID, ids.projectA, JOB_ID, INVOCATION_ID, RESULT_HASH],
    );
    await client.query(
      `UPDATE workflow_invocations
          SET status='succeeded',winner_attempt_id=$1,updated_at=now()
        WHERE id=$2`,
      [ATTEMPT_ID, INVOCATION_ID],
    );
    await client.query(
      `INSERT INTO ai_usage_events
         (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,
          provider_cost_micro_idr,charged_party,dedupe_key,created_at)
       VALUES ('task11-usage',$1,$2,$3,$4,11,7,180,'system',$5,now())`,
      [ids.projectA, JOB_ID, ATTEMPT_ID, PRICE_ID, `usage:${ATTEMPT_ID}`],
    );
    const allocationId = `allocation:${RESERVATION_ID}:prose_version:task11-output`;
    await client.query(
      `INSERT INTO credit_billing_allocations
         (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,
          contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,
          system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at)
       VALUES ($1,$2,$3,$4,'prose_version','task11-output',$5,180,180,0,1,$6::jsonb,$1,now())`,
      [
        allocationId,
        ids.projectA,
        JOB_ID,
        RESERVATION_ID,
        'durable-attempt-hash',
        JSON.stringify({
          contributingAttemptIds: [ATTEMPT_ID],
          eligibility: 'durable_output_winner',
          settlement: 'min_eligible_provider_cost_reserved',
        }),
      ],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await jobs.finish({ ...claim.identity, status: 'failed' });
      expect(await financialSnapshot(client)).toMatchObject({
        job_status: 'failed',
        reservation_status: 'settled',
        settled: '180',
        released: '820',
        exposure: '0',
        settlements: 1,
        releases: 1,
        zero_ledger: 0,
        allocations: 1,
        book: '4820',
        system_usage: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);
