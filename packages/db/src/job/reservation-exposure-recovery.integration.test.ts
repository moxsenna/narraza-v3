import {
  createJobService,
  createWorkflowInvocationService,
  type UnitOfWork,
} from '@narraza/application';
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
const jobId = '7b000000-0000-4000-8000-000000000010';
const reservationId = '7b100000-0000-4000-8000-000000000010';
const invocationId = 'task10-recovery-invocation';
const attemptId = 'task10-recovery-attempt';

suite.test(
  'reservation-exposure: replay recovers Tx L after usage commit',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, {
      id: jobId,
      projectId: ids.projectA,
      kind: 'scene_generation',
    });
    await insertReservationBinding(client, {
      reservationId,
      jobId,
      projectId: ids.projectA,
      userId: ids.userA,
      reservedMicroIdr: 1_000n,
    });
    await client.query(
      `UPDATE credit_reservations SET job_project_id=$1,funding_model='user_paid' WHERE id=$2`,
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
      `INSERT INTO model_price_snapshots (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at) VALUES ('task10-recovery-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const baseUnitOfWork = createUnitOfWork(prisma);
    const jobs = createJobService(baseUnitOfWork);
    let executions = 0;
    const failFirstLateTx: UnitOfWork = {
      execute(fn, options) {
        executions += 1;
        if (executions === 2) throw new Error('injected Tx L failure');
        return baseUnitOfWork.execute(fn, options);
      },
    };
    const failingInvocations = createWorkflowInvocationService(failFirstLateTx);
    const invocations = createWorkflowInvocationService(baseUnitOfWork);
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await jobs.finish({ ...claim.identity, status: 'failed' });
      const input = {
        ...claim.identity,
        invocationId,
        attemptId,
        status: 'failed' as const,
        providerRequestId: 'provider-recovery',
        resultHash: null,
        schemaVersion: 1,
        payload: { recovery: true },
        usage: {
          priceSnapshotId: 'task10-recovery-price',
          inputTokens: 1,
          outputTokens: 1,
          providerCostMicroIdr: 100n,
        },
      };

      await expect(failingInvocations.finalizeAttempt(input)).rejects.toThrow(
        'injected Tx L failure',
      );
      expect(
        (
          await client.query(
            `SELECT status,(SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) usage FROM credit_reservations WHERE id=$1`,
            [reservationId, attemptId],
          )
        ).rows[0],
      ).toMatchObject({ status: 'closing', usage: 1 });

      await expect(invocations.finalizeAttempt(input)).resolves.toMatchObject({
        kind: 'replayed',
        winner: 'ineligible_owner',
      });
      expect(
        (
          await client.query(
            `SELECT status,released_micro_idr::text,exposure_micro_idr::text,(SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) usage,(SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger FROM credit_reservations WHERE id=$1`,
            [reservationId, attemptId],
          )
        ).rows[0],
      ).toMatchObject({
        status: 'released',
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
        usage: 1,
        ledger: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);
