import { createWorkflowInvocationService } from '@narraza/application';
import { expect } from 'vitest';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  leaseTokens,
  setRunning,
} from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const suite = createSchemaTestSuite();
const jobId = '75000000-0000-4000-8000-000000000001';
const invocationId = '76000000-0000-4000-8000-000000000001';
const attemptA = '77000000-0000-4000-8000-000000000001';
const attemptB = '77000000-0000-4000-8000-000000000002';

async function setup(
  client: Parameters<Parameters<typeof suite.test>[1]>[0]['client'],
  databaseUrl: string,
) {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-cert','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
  );
  await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
  await setRunning(client, jobId, leaseTokens.alice, 60_000);
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createWorkflowInvocationService(createUnitOfWork(prisma));
  const identity = {
    projectId: ids.projectA,
    jobId,
    leaseToken: leaseTokens.alice,
    fenceVersion: 0,
  };
  return { prisma, service, identity };
}

const beginInput = (
  identity: { projectId: string; jobId: string; leaseToken: string; fenceVersion: number },
  attemptId = attemptA,
) => ({
  ...identity,
  invocationId,
  attemptId,
  stageKey: 'writer',
  schemaVersion: 1,
  payload: { nested: { a: 1 } },
});
const finalizeInput = (
  identity: { projectId: string; jobId: string; leaseToken: string; fenceVersion: number },
  attemptId = attemptA,
) => ({
  ...identity,
  invocationId,
  attemptId,
  status: 'succeeded' as const,
  providerRequestId: null,
  resultHash: null,
  schemaVersion: 1,
  payload: { done: true },
  usage: {
    priceSnapshotId: 'price-cert',
    inputTokens: 1,
    outputTokens: 2,
    providerCostMicroIdr: 3n,
  },
});

suite.test(
  'CAS zero-row unsupported invocation state returns conflict',
  async ({ client, databaseUrl }) => {
    const { prisma, service, identity } = await setup(client, databaseUrl);
    await service.beginAttempt(beginInput(identity));
    await client.query(`UPDATE workflow_invocations SET status='failed' WHERE id=$1`, [
      invocationId,
    ]);
    expect(await service.finalizeAttempt(finalizeInput(identity))).toEqual({ kind: 'conflict' });
    const row = await client.query(
      `SELECT ga.status,wi.status,wi.winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int usage FROM generation_attempts ga JOIN workflow_invocations wi ON wi.id=ga.invocation_id WHERE ga.id=$1`,
      [attemptA],
    );
    expect(row.rows[0]).toMatchObject({ status: 'failed', winner_attempt_id: null, usage: 0 });
    await prisma.$disconnect();
  },
);

suite.test('Tx A denial table creates zero lifecycle rows', async ({ client, databaseUrl }) => {
  const cases = [
    ['wrong project', async () => ({ projectId: ids.projectB })],
    [
      'terminal job',
      async () => {
        await client.query(
          `UPDATE generation_jobs SET status='failed',lease_token=NULL,lease_expires_at=NULL WHERE id=$1`,
          [jobId],
        );
        return {};
      },
    ],
    [
      'expired lease',
      async () => {
        await client.query(
          `UPDATE generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`,
          [jobId],
        );
        return {};
      },
    ],
    [
      'cancellation',
      async () => {
        await client.query(`UPDATE generation_jobs SET cancel_requested_at=now() WHERE id=$1`, [
          jobId,
        ]);
        return {};
      },
    ],
    [
      'tombstone',
      async () => {
        await client.query(`UPDATE projects SET deleted_at=now() WHERE id=$1`, [ids.projectA]);
        return {};
      },
    ],
  ] as const;
  for (const [name, mutate] of cases) {
    await client.query(
      `TRUNCATE workflow_invocations,generation_attempts,ai_usage_events,generation_jobs,model_price_snapshots,projects,users CASCADE`,
    );
    const { prisma, service, identity } = await setup(client, databaseUrl);
    const override = await mutate();
    expect(await service.beginAttempt({ ...beginInput(identity), ...override }), name).toEqual({
      kind: 'not_authorized',
    });
    const count = await client.query(
      `SELECT (SELECT count(*) FROM workflow_invocations)::int invocations,(SELECT count(*) FROM generation_attempts)::int attempts`,
    );
    expect(count.rows[0], name).toEqual({ invocations: 0, attempts: 0 });
    await prisma.$disconnect();
  }
});

suite.test(
  'usage replay certification: started matching usage and terminal divergent usage',
  async ({ client, databaseUrl }) => {
    const { prisma, service, identity } = await setup(client, databaseUrl);
    await service.beginAttempt(beginInput(identity));
    await service.beginAttempt(beginInput(identity, attemptB));
    await client.query(
      `INSERT INTO ai_usage_events (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,provider_cost_micro_idr,charged_party,dedupe_key,created_at) VALUES ('usage-cert',$1,$2,$3,'price-cert',1,2,3,'system',$4,now())`,
      [ids.projectA, jobId, attemptA, `usage:${attemptA}`],
    );
    expect(await service.finalizeAttempt(finalizeInput(identity))).toMatchObject({
      kind: 'finalized',
      winner: 'selected',
    });
    let snapshot = await client.query(
      `SELECT ga.status,wi.winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int usage,(SELECT count(*) FROM credit_reservations)::int reservations,(SELECT count(*) FROM credit_ledger)::int ledger FROM generation_attempts ga JOIN workflow_invocations wi ON wi.id=ga.invocation_id WHERE ga.id=$1`,
      [attemptA],
    );
    expect(snapshot.rows[0]).toMatchObject({
      status: 'succeeded',
      winner_attempt_id: attemptA,
      usage: 1,
      reservations: 0,
      ledger: 0,
    });
    await client.query(
      `UPDATE generation_attempts SET status='succeeded',finished_at=now(),payload='{"done":true}'::jsonb WHERE id=$1`,
      [attemptB],
    );
    await client.query(
      `INSERT INTO ai_usage_events (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,provider_cost_micro_idr,charged_party,dedupe_key,created_at) VALUES ('usage-divergent',$1,$2,$3,'price-cert',9,9,9,'system',$4,now())`,
      [ids.projectA, jobId, attemptB, `usage:${attemptB}`],
    );
    expect(await service.finalizeAttempt(finalizeInput(identity, attemptB))).toEqual({
      kind: 'conflict',
    });
    snapshot = await client.query(
      `SELECT ga.status,ga.payload,wi.winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int usage,(SELECT count(*) FROM credit_reservations)::int reservations,(SELECT count(*) FROM credit_ledger)::int ledger FROM generation_attempts ga JOIN workflow_invocations wi ON wi.id=ga.invocation_id WHERE ga.id=$1`,
      [attemptB],
    );
    expect(snapshot.rows[0]).toMatchObject({
      status: 'succeeded',
      payload: { done: true },
      winner_attempt_id: attemptA,
      usage: 2,
      reservations: 0,
      ledger: 0,
    });
    await prisma.$disconnect();
  },
);

suite.test(
  'Tx A concurrent ordinals, renewed replay, and semantic divergence',
  async ({ client, databaseUrl }) => {
    const { prisma, service, identity } = await setup(client, databaseUrl);
    const [a, b] = await Promise.all([
      service.beginAttempt(beginInput(identity, attemptA)),
      service.beginAttempt(beginInput(identity, attemptB)),
    ]);
    expect([a.kind, b.kind]).toEqual(['started', 'started']);
    const rows = await client.query(
      `SELECT DISTINCT invocation_id FROM generation_attempts; SELECT ordinal FROM generation_attempts ORDER BY ordinal`,
    );
    expect(rows[0]?.rows).toHaveLength(1);
    expect(rows[1]?.rows.map((row) => row.ordinal)).toEqual([0, 1]);
    await client.query(
      `UPDATE generation_jobs SET lease_expires_at=now()+interval '2 minutes' WHERE id=$1`,
      [jobId],
    );
    expect((await service.beginAttempt(beginInput(identity, attemptA))).kind).toBe(
      'already_started',
    );
    expect(
      (
        await service.beginAttempt({
          ...beginInput(identity, attemptA),
          payload: { changed: true },
        })
      ).kind,
    ).toBe('conflict');
    expect(
      (
        await service.beginAttempt({
          ...beginInput(identity, attemptA),
          invocationId: '76000000-0000-4000-8000-000000000099',
        })
      ).kind,
    ).toBe('conflict');
    expect(
      (await service.beginAttempt({ ...beginInput(identity, attemptA), stageKey: 'other' })).kind,
    ).toBe('conflict');
    await prisma.$disconnect();
  },
);
