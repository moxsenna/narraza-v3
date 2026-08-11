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
