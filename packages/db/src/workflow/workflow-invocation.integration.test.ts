import { createWorkflowInvocationService } from '@narraza/application';
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
const jobId = '72000000-0000-4000-8000-000000000001';
const invocationId = '73000000-0000-4000-8000-000000000001';
const attemptA = '74000000-0000-4000-8000-000000000001';
const attemptB = '74000000-0000-4000-8000-000000000002';

suite.test(
  'invocation-winner: concurrent billable successes select exactly one winner',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
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
    const begin = (attemptId: string) =>
      service.beginAttempt({
        ...identity,
        invocationId,
        attemptId,
        stageKey: 'writer',
        schemaVersion: 1,
        payload: { input: 1 },
      });
    const [a, b] = await Promise.all([begin(attemptA), begin(attemptB)]);
    expect([a.kind, b.kind].sort()).toEqual(['started', 'started']);
    const finalize = (attemptId: string, cost: bigint) =>
      service.finalizeAttempt({
        ...identity,
        invocationId,
        attemptId,
        status: 'succeeded',
        providerRequestId: `request-${attemptId}`,
        resultHash:
          attemptId === attemptA
            ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        schemaVersion: 1,
        payload: { result: attemptId },
        usage: {
          priceSnapshotId: 'price-1',
          inputTokens: 1,
          outputTokens: 2,
          providerCostMicroIdr: cost,
        },
      });
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    );
    const [finalA, finalB] = await Promise.all([finalize(attemptA, 10n), finalize(attemptB, 20n)]);
    expect([finalA.kind, finalB.kind]).toEqual(['finalized', 'finalized']);
    const winners = [finalA, finalB].filter(
      (result) => result.kind === 'finalized' && result.winner === 'selected',
    );
    expect(winners).toHaveLength(1);
    expect(
      [finalA, finalB].some(
        (result) => result.kind === 'finalized' && result.winner === 'already_won_by_other',
      ),
    ).toBe(true);
    const snapshot = await client.query(
      `SELECT winner_attempt_id,fence_version,(SELECT count(*) FROM generation_attempts WHERE status='succeeded')::int AS succeeded,(SELECT count(*) FROM ai_usage_events)::int AS usage FROM workflow_invocations WHERE id=$1`,
      [invocationId],
    );
    expect(snapshot.rows[0]).toMatchObject({ fence_version: 0, succeeded: 2, usage: 2 });
    expect([attemptA, attemptB]).toContain(snapshot.rows[0].winner_attempt_id);
    const loserId = snapshot.rows[0].winner_attempt_id === attemptA ? attemptB : attemptA;
    const winnerId = snapshot.rows[0].winner_attempt_id as string;
    expect(await finalize(winnerId, winnerId === attemptA ? 10n : 20n)).toMatchObject({
      kind: 'replayed',
      winner: 'selected_replay',
    });
    const staleReplay = await finalize(loserId, loserId === attemptA ? 10n : 20n);
    expect(staleReplay).toMatchObject({ kind: 'replayed', winner: 'already_won_by_other' });
    const staleInput = {
      ...identity,
      leaseToken: leaseTokens.stale,
      invocationId,
      attemptId: loserId,
      status: 'succeeded' as const,
      providerRequestId: `request-${loserId}`,
      resultHash:
        loserId === attemptA
          ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      schemaVersion: 1,
      payload: { result: loserId },
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 1,
        outputTokens: 2,
        providerCostMicroIdr: loserId === attemptA ? 10n : 20n,
      },
    };
    expect(await service.finalizeAttempt(staleInput)).toMatchObject({
      kind: 'replayed',
      winner: 'ineligible_owner',
    });
    await prisma.$disconnect();
  },
);

suite.test(
  'begin replay treats reordered nested JSON as semantically equal',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
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
    expect(
      (
        await service.beginAttempt({
          ...identity,
          invocationId,
          attemptId: attemptA,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { outer: { a: 1, b: 2 }, z: true },
        })
      ).kind,
    ).toBe('started');
    expect(
      (
        await service.beginAttempt({
          ...identity,
          invocationId,
          attemptId: attemptA,
          stageKey: 'writer',
          schemaVersion: 1,
          payload: { z: true, outer: { b: 2, a: 1 } },
        })
      ).kind,
    ).toBe('already_started');
    await prisma.$disconnect();
  },
);

suite.test(
  'usage replay derives exact attempt identity and charges system once',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    const input = {
      ...identity,
      invocationId,
      attemptId: attemptA,
      status: 'succeeded' as const,
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: { output: true, nested: { b: 2, a: 1 } },
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 10,
        outputTokens: 20,
        providerCostMicroIdr: 123n,
      },
    };
    expect((await service.finalizeAttempt(input)).kind).toBe('finalized');
    expect(
      (
        await service.finalizeAttempt({
          ...input,
          payload: { nested: { a: 1, b: 2 }, output: true },
        })
      ).kind,
    ).toBe('replayed');
    const usage = await client.query(
      `SELECT project_id,job_id,attempt_id,charged_party,dedupe_key,provider_cost_micro_idr FROM ai_usage_events`,
    );
    expect(usage.rows).toHaveLength(1);
    expect(usage.rows[0]).toMatchObject({
      project_id: ids.projectA,
      job_id: jobId,
      attempt_id: attemptA,
      charged_party: 'system',
      dedupe_key: `usage:${attemptA}`,
      provider_cost_micro_idr: '123',
    });
    const finance = await client.query(
      `SELECT (SELECT count(*) FROM credit_reservations)::int AS reservations, (SELECT count(*) FROM credit_ledger)::int AS ledger`,
    );
    expect(finance.rows[0]).toEqual({ reservations: 0, ledger: 0 });
    await prisma.$disconnect();
  },
);

suite.test(
  'failed attempt records usage without winner and divergent replay rolls back',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    const input = {
      ...identity,
      invocationId,
      attemptId: attemptA,
      status: 'failed' as const,
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: { reason: 'provider' },
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 2,
        outputTokens: 0,
        providerCostMicroIdr: 9n,
      },
    };
    expect(await service.finalizeAttempt(input)).toMatchObject({
      kind: 'finalized',
      winner: 'attempt_failed',
    });
    expect(await service.finalizeAttempt({ ...input, payload: { reason: 'different' } })).toEqual({
      kind: 'conflict',
    });
    const snapshot = await client.query(
      `SELECT wi.winner_attempt_id,ga.status,ga.payload,(SELECT count(*) FROM ai_usage_events)::int AS usage,(SELECT count(*) FROM credit_reservations)::int AS reservations,(SELECT count(*) FROM credit_ledger)::int AS ledger FROM workflow_invocations wi JOIN generation_attempts ga ON ga.invocation_id=wi.id WHERE wi.id=$1`,
      [invocationId],
    );
    expect(snapshot.rows[0]).toMatchObject({
      winner_attempt_id: null,
      status: 'failed',
      payload: { reason: 'provider' },
      usage: 1,
      reservations: 0,
      ledger: 0,
    });
    await prisma.$disconnect();
  },
);

suite.test(
  'late-attempt: stale owner and cancellation precedence commit lifecycle usage without winner',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptB,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    await client.query(
      `UPDATE generation_jobs SET cancel_requested_at=now(),lease_expires_at=now()-interval '1 second' WHERE id=$1`,
      [jobId],
    );
    const finalize = (attemptId: string, leaseToken: string) =>
      service.finalizeAttempt({
        ...identity,
        leaseToken,
        invocationId,
        attemptId,
        status: 'succeeded',
        providerRequestId: null,
        resultHash:
          attemptId === attemptA
            ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
            : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        schemaVersion: 1,
        payload: {},
        usage: {
          priceSnapshotId: 'price-1',
          inputTokens: 1,
          outputTokens: 1,
          providerCostMicroIdr: 1n,
        },
      });
    expect(await finalize(attemptA, leaseTokens.stale)).toMatchObject({
      kind: 'finalized',
      winner: 'cancelled',
    });
    expect(await finalize(attemptA, leaseTokens.stale)).toMatchObject({
      kind: 'replayed',
      winner: 'cancelled',
    });
    expect(await finalize(attemptB, leaseTokens.alice)).toMatchObject({
      kind: 'finalized',
      winner: 'cancelled',
    });
    const snapshot = await client.query(
      `SELECT winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int AS usage FROM workflow_invocations WHERE id=$1`,
      [invocationId],
    );
    expect(snapshot.rows[0]).toEqual({ winner_attempt_id: null, usage: 2 });
    await prisma.$disconnect();
  },
);

suite.test(
  'replay matrix: divergent preexisting usage rolls back fresh finalization',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    await client.query(
      `INSERT INTO ai_usage_events (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,provider_cost_micro_idr,charged_party,dedupe_key,created_at) VALUES ('usage-forged',$1,$2,$3,'price-1',99,99,99,'user',$4,now())`,
      [ids.projectA, jobId, attemptA, `usage:${attemptA}`],
    );
    const result = await service.finalizeAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      status: 'succeeded',
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: { done: true },
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 1,
        outputTokens: 2,
        providerCostMicroIdr: 3n,
      },
    });
    expect(result).toEqual({ kind: 'conflict' });
    const snapshot = await client.query(
      `SELECT ga.status,ga.finished_at,wi.winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int AS usage,(SELECT charged_party FROM ai_usage_events LIMIT 1) AS charged_party,(SELECT count(*) FROM credit_reservations)::int AS reservations,(SELECT count(*) FROM credit_ledger)::int AS ledger FROM generation_attempts ga JOIN workflow_invocations wi ON wi.id=ga.invocation_id WHERE ga.id=$1`,
      [attemptA],
    );
    expect(snapshot.rows[0]).toMatchObject({
      status: 'started',
      finished_at: null,
      winner_attempt_id: null,
      usage: 1,
      charged_party: 'user',
      reservations: 0,
      ledger: 0,
    });
    await prisma.$disconnect();
  },
);

suite.test(
  'replay matrix: terminal matching missing usage inserts once without selecting winner',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    await service.beginAttempt({
      ...identity,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    await client.query(
      `UPDATE generation_attempts SET status='succeeded',finished_at=now(),payload='{"done":true}'::jsonb WHERE id=$1`,
      [attemptA],
    );
    const input = {
      ...identity,
      invocationId,
      attemptId: attemptA,
      status: 'succeeded' as const,
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: { done: true },
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 1,
        outputTokens: 2,
        providerCostMicroIdr: 3n,
      },
    };
    expect(await service.finalizeAttempt(input)).toMatchObject({
      kind: 'replayed',
      winner: 'not_selected',
    });
    expect(await service.finalizeAttempt(input)).toMatchObject({
      kind: 'replayed',
      winner: 'not_selected',
    });
    const snapshot = await client.query(
      `SELECT winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int AS usage FROM workflow_invocations WHERE id=$1`,
      [invocationId],
    );
    expect(snapshot.rows[0]).toEqual({ winner_attempt_id: null, usage: 1 });
    await prisma.$disconnect();
  },
);

suite.test(
  'replay matrix: terminal divergence stops before missing matching or forged usage mutation',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('price-1','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
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
    const attempts = [attemptA, attemptB, '74000000-0000-4000-8000-000000000003'];
    for (const attemptId of attempts) {
      await service.beginAttempt({
        ...identity,
        invocationId,
        attemptId,
        stageKey: 'writer',
        schemaVersion: 1,
        payload: {},
      });
      await client.query(
        `UPDATE generation_attempts SET status='succeeded',finished_at=now(),payload='{"stored":true}'::jsonb WHERE id=$1`,
        [attemptId],
      );
    }
    await client.query(
      `INSERT INTO ai_usage_events (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,provider_cost_micro_idr,charged_party,dedupe_key,created_at) VALUES ('usage-match',$1,$2,$3,'price-1',1,2,3,'system',$4,now()),('usage-forged',$5,$2,$6,'price-1',1,2,3,'system',$7,now())`,
      [
        ids.projectA,
        jobId,
        attemptB,
        `usage:${attemptB}`,
        ids.projectB,
        attempts[2],
        `usage:${attempts[2]}`,
      ],
    );
    for (const attemptId of attempts) {
      expect(
        await service.finalizeAttempt({
          ...identity,
          invocationId,
          attemptId,
          status: 'succeeded',
          providerRequestId: null,
          resultHash: null,
          schemaVersion: 1,
          payload: { incoming: true },
          usage: {
            priceSnapshotId: 'price-1',
            inputTokens: 1,
            outputTokens: 2,
            providerCostMicroIdr: 3n,
          },
        }),
      ).toEqual({ kind: 'conflict' });
    }
    const snapshot = await client.query(
      `SELECT winner_attempt_id,(SELECT count(*) FROM ai_usage_events)::int AS usage,(SELECT count(*) FROM credit_reservations)::int AS reservations,(SELECT count(*) FROM credit_ledger)::int AS ledger FROM workflow_invocations WHERE id=$1`,
      [invocationId],
    );
    expect(snapshot.rows[0]).toEqual({
      winner_attempt_id: null,
      usage: 2,
      reservations: 0,
      ledger: 0,
    });
    const missing = await service.finalizeAttempt({
      ...identity,
      attemptId: '74000000-0000-4000-8000-000000000099',
      invocationId,
      status: 'succeeded',
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: {},
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 1,
        outputTokens: 1,
        providerCostMicroIdr: 1n,
      },
    });
    const crossProject = await service.finalizeAttempt({
      ...identity,
      projectId: ids.projectB,
      attemptId: attemptA,
      invocationId,
      status: 'succeeded',
      providerRequestId: null,
      resultHash: null,
      schemaVersion: 1,
      payload: {},
      usage: {
        priceSnapshotId: 'price-1',
        inputTokens: 1,
        outputTokens: 1,
        providerCostMicroIdr: 1n,
      },
    });
    expect(missing).toEqual({ kind: 'not_authorized' });
    expect(crossProject).toEqual({ kind: 'not_authorized' });
    await prisma.$disconnect();
  },
);

suite.test(
  'Tx A denies stale token without creating invocation or attempt',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA });
    await setRunning(client, jobId, leaseTokens.alice, 60_000);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createWorkflowInvocationService(createUnitOfWork(prisma));
    const result = await service.beginAttempt({
      projectId: ids.projectA,
      jobId,
      leaseToken: leaseTokens.stale,
      fenceVersion: 0,
      invocationId,
      attemptId: attemptA,
      stageKey: 'writer',
      schemaVersion: 1,
      payload: {},
    });
    expect(result).toEqual({ kind: 'not_authorized' });
    const rows = await client.query(
      `SELECT (SELECT count(*) FROM workflow_invocations)::int AS invocations, (SELECT count(*) FROM generation_attempts)::int AS attempts`,
    );
    expect(rows.rows[0]).toMatchObject({ invocations: 0, attempts: 0 });
    await prisma.$disconnect();
  },
);
