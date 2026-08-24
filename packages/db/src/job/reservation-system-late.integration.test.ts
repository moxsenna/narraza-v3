import { createJobService, createWorkflowInvocationService } from '@narraza/application';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  insertReservationBinding,
  leaseTokens,
} from './job-test-fixtures.js';

const suite = createSchemaTestSuite();
const jobId = '7d000000-0000-4000-8000-000000000010';
const reservationId = '7d100000-0000-4000-8000-000000000010';
const invocationId = 'task10-system-invocation';
const attemptId = 'task10-system-attempt';

suite.test(
  'reservation-exposure: system-funded unresolved attempt late-closes with zero user ledger',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobId, projectId: ids.projectA, kind: 'chat_intake' });
    await insertReservationBinding(client, {
      reservationId,
      jobId,
      projectId: ids.projectA,
      userId: ids.userA,
      reservedMicroIdr: 1_000n,
    });
    await client.query(
      `UPDATE credit_reservations SET job_project_id=$1,funding_model='system_funded' WHERE id=$2`,
      [ids.projectA, reservationId],
    );
    await client.query(
      `INSERT INTO workflow_invocations (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at) VALUES ($1,$2,$3,'writer','running',NULL,0,now(),now())`,
      [invocationId, ids.projectA, jobId],
    );
    await client.query(
      `INSERT INTO generation_attempts (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at) VALUES ($1,$2,$3,$4,0,'started',now(),NULL,1,'{}',now(),now())`,
      [attemptId, ids.projectA, jobId, invocationId],
    );
    await client.query(
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('task10-system-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    const invocations = createWorkflowInvocationService(createUnitOfWork(prisma));
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await jobs.finish({ ...claim.identity, status: 'failed' });
      expect(
        (
          await client.query(
            `SELECT status,exposure_micro_idr::text exposure FROM credit_reservations WHERE id=$1`,
            [reservationId],
          )
        ).rows[0],
      ).toEqual({ status: 'closing', exposure: '1000' });
      await expect(
        invocations.finalizeAttempt({
          ...claim.identity,
          leaseToken: leaseTokens.stale,
          invocationId,
          attemptId,
          status: 'failed',
          providerRequestId: 'system-late-provider',
          resultHash: null,
          schemaVersion: 1,
          payload: { late: true },
          usage: {
            priceSnapshotId: 'task10-system-price',
            inputTokens: 1,
            outputTokens: 1,
            providerCostMicroIdr: 100n,
          },
        }),
      ).resolves.toMatchObject({ kind: 'finalized', winner: 'ineligible_owner' });
      expect(
        (
          await client.query(
            `SELECT status,released_micro_idr::text released,exposure_micro_idr::text exposure,(SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger,(SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2 AND charged_party='system') usage FROM credit_reservations WHERE id=$1`,
            [reservationId, attemptId],
          )
        ).rows[0],
      ).toMatchObject({ status: 'released', released: '1000', exposure: '0', ledger: 0, usage: 1 });
    } finally {
      await prisma.$disconnect();
    }
  },
);
