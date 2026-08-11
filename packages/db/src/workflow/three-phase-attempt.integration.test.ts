import {
  createJobService,
  createThreePhaseAttemptHarness,
  createWorkflowInvocationService,
  type JobService,
  type TxPorts,
  type UnitOfWork,
} from '@narraza/application';
import { Pool } from 'pg';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createProjectRepo } from '../repos/project-repo.js';
import {
  createPrismaForUrl,
  fetchJobRow,
  insertQueuedJobRow,
  leaseTokens,
  setRunning,
} from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';

const suite = createSchemaTestSuite();
const jobId = '75000000-0000-4000-8000-000000000001';
const invocationId = '76000000-0000-4000-8000-000000000001';
const attemptId = '77000000-0000-4000-8000-000000000001';
const resultHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sentinelKey = `workflow-attempt-validated:${invocationId}:${attemptId}`;
const wait = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const harnessInput = {
  projectId: ids.projectA,
  jobId,
  leaseToken: leaseTokens.alice,
  fenceVersion: 0,
  invocationId,
  attemptId,
  stageKey: 'writer',
  schemaVersion: 1,
  payload: { input: true },
} as const;

const billableOutcome = {
  kind: 'billable',
  status: 'succeeded',
  providerRequestId: 'request',
  resultHash,
  schemaVersion: 1,
  payload: { result: true },
  usage: {
    priceSnapshotId: 'phase-price',
    inputTokens: 1,
    outputTokens: 2,
    providerCostMicroIdr: 3n,
  },
} as const;

async function seedAttemptTest(client: Pool) {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('phase-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
  );
  await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
  await setRunning(client, jobId, leaseTokens.alice, 60_000);
}

async function waitUntilBlocked(client: Pool, applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await client.query(
      `SELECT cardinality(pg_blocking_pids(pid)) > 0 AS blocked
         FROM pg_stat_activity
        WHERE application_name=$1`,
      [applicationName],
    );
    if (result.rows[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${applicationName} did not block before deadline`);
}

async function durableSnapshot(client: Pool) {
  return (
    await client.query(
      `SELECT j.status,i.winner_attempt_id,(SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$1) usage,(SELECT count(*)::int FROM outbox_events WHERE dedupe_key=$2) sentinel FROM generation_jobs j JOIN workflow_invocations i ON i.job_id=j.id WHERE j.id=$3`,
      [attemptId, sentinelKey, jobId],
    )
  ).rows[0];
}

suite.test(
  'three phases expose only committed state across independent connections',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('phase-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    );
    await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
    await setRunning(client, jobId, leaseTokens.alice, 60_000);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      let active = 0;
      const base = createUnitOfWork(prisma);
      const counted: UnitOfWork = {
        execute: (callback, options) =>
          base.execute(async (ports) => {
            active++;
            try {
              return await callback(ports);
            } finally {
              active--;
            }
          }, options),
      };
      const executorGate = wait();
      const executorEntered = wait();
      const validatorGate = wait();
      const validatorEntered = wait();
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(counted),
        jobs: createJobService(counted),
        executor: async () => {
          expect(active).toBe(0);
          executorEntered.release();
          await executorGate.promise;
          return {
            kind: 'billable',
            status: 'succeeded',
            providerRequestId: 'request',
            resultHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            schemaVersion: 1,
            payload: { result: true },
            usage: {
              priceSnapshotId: 'phase-price',
              inputTokens: 1,
              outputTokens: 2,
              providerCostMicroIdr: 3n,
            },
          };
        },
        validator: async () => {
          expect(active).toBe(0);
          validatorEntered.release();
          await validatorGate.promise;
          return { kind: 'valid' };
        },
      });
      const running = harness.run({
        projectId: ids.projectA,
        jobId,
        leaseToken: leaseTokens.alice,
        fenceVersion: 0,
        invocationId,
        attemptId,
        stageKey: 'writer',
        schemaVersion: 1,
        payload: { input: true },
      });
      await executorEntered.promise;
      expect(
        (await client.query(`SELECT status FROM generation_attempts WHERE id=$1`, [attemptId]))
          .rows[0],
      ).toEqual({ status: 'started' });
      executorGate.release();
      await validatorEntered.promise;
      const middle = await client.query(
        `SELECT a.status,i.winner_attempt_id,(SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$1) usage,(SELECT count(*)::int FROM outbox_events WHERE dedupe_key=$2) sentinel FROM generation_attempts a JOIN workflow_invocations i ON i.id=a.invocation_id WHERE a.id=$1`,
        [attemptId, `workflow-attempt-validated:${invocationId}:${attemptId}`],
      );
      expect(middle.rows[0]).toMatchObject({
        status: 'succeeded',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 0,
      });
      validatorGate.release();
      expect(await running).toMatchObject({ kind: 'published' });
      const final = await client.query(
        `SELECT j.status,o.aggregate_type,o.aggregate_id,o.event_type,o.dedupe_key,o.schema_version,o.payload
         FROM generation_jobs j
         JOIN outbox_events o ON o.dedupe_key=$2
        WHERE j.id=$1`,
        [jobId, sentinelKey],
      );
      expect(final.rows).toEqual([
        {
          status: 'succeeded',
          aggregate_type: 'workflow_invocation',
          aggregate_id: invocationId,
          event_type: 'workflow_attempt_validated',
          dedupe_key: sentinelKey,
          schema_version: 1,
          payload: {
            projectId: ids.projectA,
            jobId,
            invocationId,
            attemptId,
            stageKey: 'writer',
            resultHash,
          },
        },
      ]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'late-attempt: reclaimed worker A commits one system usage but cannot validate or publish over worker B',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('phase-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    );
    await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const uow = createUnitOfWork(prisma);
      const jobs = createJobService(uow);
      const claimA = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      expect(claimA.kind).toBe('claimed');
      if (claimA.kind !== 'claimed') throw new Error('worker A did not claim');
      const executorEntered = wait();
      const executorGate = wait();
      const validator = async () => ({ kind: 'valid' as const });
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(uow),
        jobs,
        executor: async () => {
          executorEntered.release();
          await executorGate.promise;
          return billableOutcome;
        },
        validator,
      });
      const running = harness.run({ ...harnessInput, ...claimA.identity });
      await executorEntered.promise;
      await client.query(
        `UPDATE generation_jobs SET lease_expires_at=clock_timestamp()-interval '1 millisecond' WHERE id=$1`,
        [jobId],
      );
      await expect(jobs.reclaimOne({})).resolves.toMatchObject({ kind: 'requeued' });
      const claimB = await jobs.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 60_000 });
      expect(claimB.kind).toBe('claimed');
      if (claimB.kind !== 'claimed') throw new Error('worker B did not claim');
      expect(claimB.identity.fenceVersion).toBeGreaterThan(claimA.identity.fenceVersion);
      executorGate.release();

      await expect(running).resolves.toMatchObject({
        kind: 'finalized_without_publish',
        winner: 'ineligible_owner',
      });
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: null,
        usage: 1,
        sentinel: 0,
      });
      expect(await fetchJobRow(client, jobId)).toMatchObject({
        status: 'running',
        leaseToken: claimB.identity.leaseToken,
        fenceVersion: claimB.identity.fenceVersion,
      });
      expect(
        (
          await client.query(`SELECT charged_party FROM ai_usage_events WHERE attempt_id=$1`, [
            attemptId,
          ])
        ).rows,
      ).toEqual([{ charged_party: 'system' }]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'cancel-mid-attempt: existing cancellation path commits usage without winner validation sentinel or success',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const uow = createUnitOfWork(prisma);
      const jobs = createJobService(uow);
      const executorEntered = wait();
      const executorGate = wait();
      let validatorCalls = 0;
      const running = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(uow),
        jobs,
        executor: async () => {
          executorEntered.release();
          await executorGate.promise;
          return billableOutcome;
        },
        validator: async () => {
          validatorCalls++;
          return { kind: 'valid' };
        },
      }).run(harnessInput);
      await executorEntered.promise;
      await expect(jobs.cancel({ projectId: ids.projectA, jobId })).resolves.toEqual({
        kind: 'cancellation_requested',
      });
      executorGate.release();

      await expect(running).resolves.toMatchObject({
        kind: 'finalized_without_publish',
        winner: 'cancelled',
      });
      expect(validatorCalls).toBe(0);
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: null,
        usage: 1,
        sentinel: 0,
      });
      expect(await fetchJobRow(client, jobId)).toMatchObject({
        status: 'running',
        cancelRequestedAt: expect.any(Date),
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'tombstone-mid-attempt: project-lock writer wins before Tx B so cost commits without winner or publish',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const uow = createUnitOfWork(prisma);
      const executorEntered = wait();
      const executorGate = wait();
      const validator = async () => ({ kind: 'valid' as const });
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(uow),
        jobs: createJobService(uow),
        executor: async () => {
          executorEntered.release();
          await executorGate.promise;
          return billableOutcome;
        },
        validator,
      });
      const running = harness.run(harnessInput);
      await executorEntered.promise;
      await prisma.$transaction(async (tx) => {
        const project = await createProjectRepo(tx).lockForUpdate(ids.projectA);
        expect(project?.deletedAt).toBeNull();
        await tx.$executeRaw`UPDATE projects SET deleted_at=now() WHERE id=${ids.projectA}`;
      });
      executorGate.release();

      await expect(running).resolves.toMatchObject({
        kind: 'finalized_without_publish',
        winner: 'project_tombstoned',
      });
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: null,
        usage: 1,
        sentinel: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'project-lock ordering: Tx C first blocks tombstone writer until publish commits',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const callbackEntered = wait();
      const callbackGate = wait();
      const publishing = createJobService(createUnitOfWork(prisma)).withFencedPublish(
        harnessInput,
        async () => {
          callbackEntered.release();
          await callbackGate.promise;
        },
      );
      await callbackEntered.promise;
      const writer = new Pool({
        connectionString: databaseUrl,
        application_name: 'tombstone-writer',
      });
      try {
        const tombstone = writer.query(`
          BEGIN;
          SET LOCAL lock_timeout='5s';
          SELECT id FROM projects WHERE id='${ids.projectA}' FOR UPDATE;
          UPDATE projects SET deleted_at=now() WHERE id='${ids.projectA}';
          COMMIT;
        `);
        await waitUntilBlocked(client, 'tombstone-writer');
        expect(
          (await client.query(`SELECT deleted_at FROM projects WHERE id=$1`, [ids.projectA]))
            .rows[0],
        ).toEqual({ deleted_at: null });
        callbackGate.release();
        await expect(publishing).resolves.toMatchObject({ kind: 'published' });
        await expect(tombstone).resolves.toBeDefined();
        expect(
          (await client.query(`SELECT deleted_at FROM projects WHERE id=$1`, [ids.projectA]))
            .rows[0]?.deleted_at,
        ).toBeInstanceOf(Date);
      } finally {
        callbackGate.release();
        await writer.end();
      }
    } finally {
      await prisma.$disconnect();
    }
  },
  15_000,
);

suite.test(
  'project-lock ordering: tombstone writer first blocks Tx C then denies before callback and job lock',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const writer = new Pool({
      connectionString: databaseUrl,
      application_name: 'tombstone-holder',
    });
    const held = await writer.connect();
    let committed = false;
    let prisma: ReturnType<typeof createPrismaForUrl> | undefined;
    try {
      await held.query('BEGIN');
      await held.query(`SET LOCAL lock_timeout='5s'`);
      await held.query(`SELECT id FROM projects WHERE id=$1 FOR UPDATE`, [ids.projectA]);
      prisma = createPrismaForUrl(
        `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}application_name=tx-c-waiter`,
      );
      let callbackCalls = 0;
      const publishing = createJobService(createUnitOfWork(prisma)).withFencedPublish(
        harnessInput,
        async () => {
          callbackCalls++;
        },
      );
      await waitUntilBlocked(client, 'tx-c-waiter');
      await held.query(`UPDATE projects SET deleted_at=now() WHERE id=$1`, [ids.projectA]);
      await held.query('COMMIT');
      committed = true;
      await expect(publishing).resolves.toEqual({ kind: 'project_tombstoned' });
      expect(callbackCalls).toBe(0);
      expect(await fetchJobRow(client, jobId)).toMatchObject({ status: 'running' });
    } finally {
      if (!committed) await held.query('ROLLBACK').catch(() => undefined);
      held.release();
      await prisma?.$disconnect();
      await writer.end();
    }
  },
  15_000,
);

suite.test(
  'tombstone-after-winner: blocked validator exposes winner then real harness Tx C denies publish',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const uow = createUnitOfWork(prisma);
      const validatorEntered = wait();
      const validatorGate = wait();
      const running = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(uow),
        jobs: createJobService(uow),
        executor: async () => billableOutcome,
        validator: async () => {
          validatorEntered.release();
          await validatorGate.promise;
          return { kind: 'valid' };
        },
      }).run(harnessInput);
      await validatorEntered.promise;
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 0,
      });
      await prisma.$transaction(async (tx) => {
        const project = await createProjectRepo(tx).lockForUpdate(ids.projectA);
        expect(project?.deletedAt).toBeNull();
        await tx.$executeRaw`UPDATE projects SET deleted_at=now() WHERE id=${ids.projectA}`;
      });
      validatorGate.release();

      await expect(running).resolves.toEqual({
        kind: 'publish_denied',
        outcome: 'project_tombstoned',
      });
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'preexisting duplicate sentinel rejects Tx C atomically and preserves running winner usage',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    await client.query(
      `INSERT INTO outbox_events (id,aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload,occurred_at,created_at)
       VALUES ('78000000-0000-4000-8000-000000000001','workflow_invocation',$1,'workflow_attempt_validated',$2,1,$3::jsonb,now(),now())`,
      [invocationId, sentinelKey, JSON.stringify({ preexisting: true })],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(createUnitOfWork(prisma)),
        jobs: createJobService(createUnitOfWork(prisma)),
        executor: async () => billableOutcome,
        validator: async () => ({ kind: 'valid' }),
      });

      let duplicateError: unknown;
      try {
        await harness.run(harnessInput);
      } catch (error) {
        duplicateError = error;
      }
      expect(duplicateError).toMatchObject({
        code: 'P2002',
        meta: {
          modelName: 'OutboxEvent',
          target: expect.arrayContaining(['dedupe_key']),
        },
      });
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 1,
      });
      const sentinels = await client.query(
        `SELECT aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
         FROM outbox_events WHERE dedupe_key=$1`,
        [sentinelKey],
      );
      expect(sentinels.rows).toEqual([
        {
          aggregate_type: 'workflow_invocation',
          aggregate_id: invocationId,
          event_type: 'workflow_attempt_validated',
          dedupe_key: sentinelKey,
          schema_version: 1,
          payload: { preexisting: true },
        },
      ]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'terminal CAS rejection rolls back appended sentinel but preserves committed winner and usage',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const real = createUnitOfWork(prisma);
      const rejecting: UnitOfWork = {
        execute: (callback, options) =>
          real.execute(
            (ports) =>
              callback({
                ...ports,
                job: {
                  ...ports.job,
                  transitionRunningToTerminal: async () => ({
                    kind: 'cancellation_blocks_success' as const,
                  }),
                },
              } as TxPorts),
            options,
          ),
      };
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(real),
        jobs: createJobService(rejecting),
        executor: async () => billableOutcome,
        validator: async () => ({ kind: 'valid' }),
      });

      expect(await harness.run(harnessInput)).toEqual({
        kind: 'publish_denied',
        outcome: 'cancellation_blocks_success',
      });
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'callback throw after append rolls back sentinel and job success but preserves winner and usage',
  async ({ client, databaseUrl }) => {
    await seedAttemptTest(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const real = createUnitOfWork(prisma);
      const realJobs = createJobService(real);
      const throwingJobs: JobService = {
        ...realJobs,
        withFencedPublish: (identity, callback) =>
          realJobs.withFencedPublish(identity, async (context) => {
            await callback(context);
            throw new Error('forced callback failure');
          }),
      };
      const harness = createThreePhaseAttemptHarness({
        workflow: createWorkflowInvocationService(real),
        jobs: throwingJobs,
        executor: async () => billableOutcome,
        validator: async () => ({ kind: 'valid' }),
      });

      await expect(harness.run(harnessInput)).rejects.toThrow('forced callback failure');
      expect(await durableSnapshot(client)).toMatchObject({
        status: 'running',
        winner_attempt_id: attemptId,
        usage: 1,
        sentinel: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);
