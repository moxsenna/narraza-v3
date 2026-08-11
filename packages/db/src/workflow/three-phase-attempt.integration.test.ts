import {
  createJobService,
  createThreePhaseAttemptHarness,
  createWorkflowInvocationService,
  type UnitOfWork,
} from '@narraza/application';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import {
  createPrismaForUrl,
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
const wait = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

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
      `SELECT j.status,(SELECT count(*)::int FROM outbox_events WHERE dedupe_key=$2) sentinel FROM generation_jobs j WHERE j.id=$1`,
      [jobId, `workflow-attempt-validated:${invocationId}:${attemptId}`],
    );
    expect(final.rows[0]).toEqual({ status: 'succeeded', sentinel: 1 });
    await prisma.$disconnect();
  },
);
