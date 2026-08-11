import { createWorkflowInvocationService } from '@narraza/application';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createPrismaForUrl, insertQueuedJobRow, leaseTokens, setRunning } from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';

const suite = createSchemaTestSuite();
const jobId = '72000000-0000-4000-8000-000000000001';
const invocationId = '73000000-0000-4000-8000-000000000001';
const attemptA = '74000000-0000-4000-8000-000000000001';
const attemptB = '74000000-0000-4000-8000-000000000002';

suite.test('invocation-winner: concurrent billable successes select exactly one winner', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
  await setRunning(client, jobId, leaseTokens.alice, 60_000);
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createWorkflowInvocationService(createUnitOfWork(prisma));
  const identity = { projectId: ids.projectA, jobId, leaseToken: leaseTokens.alice, fenceVersion: 0 };
  const begin = (attemptId: string) => service.beginAttempt({ ...identity, invocationId, attemptId, stageKey: 'writer', schemaVersion: 1, payload: { input: 1 } });
  const [a, b] = await Promise.all([begin(attemptA), begin(attemptB)]);
  expect([a.kind, b.kind].sort()).toEqual(['started', 'started']);
  const ordinals = await client.query(`SELECT ordinal FROM generation_attempts ORDER BY ordinal`);
  expect(ordinals.rows.map((row) => row.ordinal)).toEqual([0, 1]);
  await prisma.$disconnect();
});

suite.test('usage replay derives exact attempt identity and charges system once', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await client.query(`INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`);
  await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
  await setRunning(client, jobId, leaseTokens.alice, 60_000);
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createWorkflowInvocationService(createUnitOfWork(prisma));
  const identity = { projectId: ids.projectA, jobId, leaseToken: leaseTokens.alice, fenceVersion: 0 };
  await service.beginAttempt({ ...identity, invocationId, attemptId: attemptA, stageKey: 'writer', schemaVersion: 1, payload: {} });
  const input = { ...identity, invocationId, attemptId: attemptA, status: 'succeeded' as const, providerRequestId: 'request-1', resultHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', schemaVersion: 1, payload: { output: true }, usage: { priceSnapshotId: 'price-1', inputTokens: 10, outputTokens: 20, providerCostMicroIdr: 123n } };
  expect((await service.finalizeAttempt(input)).kind).toBe('finalized');
  expect((await service.finalizeAttempt(input)).kind).toBe('replayed');
  const usage = await client.query(`SELECT project_id,job_id,attempt_id,charged_party,dedupe_key,provider_cost_micro_idr FROM ai_usage_events`);
  expect(usage.rows).toHaveLength(1);
  expect(usage.rows[0]).toMatchObject({ project_id: ids.projectA, job_id: jobId, attempt_id: attemptA, charged_party: 'system', dedupe_key: `usage:${attemptA}`, provider_cost_micro_idr: '123' });
  const finance = await client.query(`SELECT (SELECT count(*) FROM credit_reservations)::int AS reservations, (SELECT count(*) FROM credit_ledger)::int AS ledger`);
  expect(finance.rows[0]).toEqual({ reservations: 0, ledger: 0 });
  await prisma.$disconnect();
});

suite.test('Tx A denies stale token without creating invocation or attempt', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
  await setRunning(client, jobId, leaseTokens.alice, 60_000);
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createWorkflowInvocationService(createUnitOfWork(prisma));
  const result = await service.beginAttempt({ projectId: ids.projectA, jobId, leaseToken: leaseTokens.stale, fenceVersion: 0, invocationId, attemptId: attemptA, stageKey: 'writer', schemaVersion: 1, payload: {} });
  expect(result).toEqual({ kind: 'not_authorized' });
  const rows = await client.query(`SELECT (SELECT count(*) FROM workflow_invocations)::int AS invocations, (SELECT count(*) FROM generation_attempts)::int AS attempts`);
  expect(rows.rows[0]).toMatchObject({ invocations: 0, attempts: 0 });
  await prisma.$disconnect();
});
