import { createJobService, createWorkflowInvocationService } from '@narraza/application';
import type { Pool } from 'pg';
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
const JOB_ID = '7a000000-0000-4000-8000-000000000010';
const RESERVATION_ID = '7a100000-0000-4000-8000-000000000010';
const INVOCATION_ID = 'task10-invocation';
const ATTEMPT_A = 'task10-attempt-a';
const ATTEMPT_B = 'task10-attempt-b';

async function seedRunningExposure(client: Pool) {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, {
    id: JOB_ID,
    projectId: ids.projectA,
    kind: 'scene_generation',
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
        SET job_project_id=$1,funding_model='user_paid'
      WHERE id=$2`,
    [ids.projectA, RESERVATION_ID],
  );
  await client.query(
    `INSERT INTO workflow_invocations
       (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at)
     VALUES ($1,$2,$3,'writer','running',NULL,0,now(),now())`,
    [INVOCATION_ID, ids.projectA, JOB_ID],
  );
  await client.query(
    `INSERT INTO generation_attempts
       (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
     VALUES ($1,$3,$4,$5,0,'started',now(),NULL,1,'{}',now(),now()),
            ($2,$3,$4,$5,1,'started',now(),NULL,1,'{}',now(),now())`,
    [ATTEMPT_A, ATTEMPT_B, ids.projectA, JOB_ID, INVOCATION_ID],
  );
  await client.query(
    `INSERT INTO model_price_snapshots
       (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
     VALUES ('task10-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
  );
}

const usage = {
  priceSnapshotId: 'task10-price',
  inputTokens: 1,
  outputTokens: 1,
  providerCostMicroIdr: 100n,
} as const;

suite.test(
  'reservation-exposure: terminal job closes hold, last late result final-closes without lease',
  async ({ client, databaseUrl }) => {
    await seedRunningExposure(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    const invocations = createWorkflowInvocationService(createUnitOfWork(prisma));
    try {
      const clock = await client.query(`SELECT now() AS before_close`);
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      await expect(jobs.finish({ ...claim.identity, status: 'failed' })).resolves.toMatchObject({
        kind: 'terminalized',
        job: { status: 'failed', leaseToken: null, leaseExpiresAt: null },
      });

      const closing = await client.query(
        `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
                closing_at,closing_at >= $2::timestamptz AS pg_clock,
                (SELECT count(*)::int FROM generation_jobs WHERE project_id=$1 AND status IN ('queued','running')) AS active_jobs
           FROM credit_reservations WHERE id=$3`,
        [ids.projectA, clock.rows[0].before_close, RESERVATION_ID],
      );
      expect(closing.rows[0]).toMatchObject({
        status: 'closing',
        settled_micro_idr: '0',
        released_micro_idr: '0',
        exposure_micro_idr: '1000',
        pg_clock: true,
        active_jobs: 0,
      });
      expect(closing.rows[0].closing_at).not.toBeNull();

      const lateInput = (attemptId: string) => ({
        ...claim.identity,
        leaseToken: leaseTokens.stale,
        fenceVersion: claim.identity.fenceVersion - 1,
        invocationId: INVOCATION_ID,
        attemptId,
        status: 'failed' as const,
        providerRequestId: `provider-${attemptId}`,
        resultHash: null,
        schemaVersion: 1,
        payload: { late: attemptId },
        usage,
      });

      await expect(invocations.finalizeAttempt(lateInput(ATTEMPT_A))).resolves.toMatchObject({
        kind: 'finalized',
        winner: 'ineligible_owner',
      });
      expect(
        (
          await client.query(
            `SELECT status,exposure_micro_idr::text,
                    (SELECT count(*)::int FROM ai_usage_events) AS usage_count,
                    (SELECT count(*)::int FROM credit_ledger) AS ledger_count
               FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID],
          )
        ).rows[0],
      ).toMatchObject({
        status: 'closing',
        exposure_micro_idr: '1000',
        usage_count: 1,
        ledger_count: 0,
      });

      await expect(invocations.finalizeAttempt(lateInput(ATTEMPT_B))).resolves.toMatchObject({
        kind: 'finalized',
        winner: 'ineligible_owner',
      });
      const closed = await client.query(
        `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,closing_at,
                (SELECT count(*)::int FROM ai_usage_events) AS usage_count,
                (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) AS ledger_count,
                (SELECT dedupe_key FROM credit_ledger WHERE reservation_id=$1) AS dedupe_key
           FROM credit_reservations WHERE id=$1`,
        [RESERVATION_ID],
      );
      expect(closed.rows[0]).toMatchObject({
        status: 'released',
        settled_micro_idr: '0',
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
        usage_count: 2,
        ledger_count: 1,
        dedupe_key: `release:${RESERVATION_ID}:final-close`,
      });
      expect(closed.rows[0].closing_at.getTime()).toBe(closing.rows[0].closing_at.getTime());

      await expect(invocations.finalizeAttempt(lateInput(ATTEMPT_B))).resolves.toMatchObject({
        kind: 'replayed',
        winner: 'ineligible_owner',
      });
      expect(
        (
          await client.query(
            `SELECT released_micro_idr::text,exposure_micro_idr::text,
                    (SELECT count(*)::int FROM ai_usage_events) AS usage_count,
                    (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) AS ledger_count
               FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID],
          )
        ).rows[0],
      ).toMatchObject({
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
        usage_count: 2,
        ledger_count: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'reservation-exposure: deterministic final-close conflict rolls back Tx L after usage commit',
  async ({ client, databaseUrl }) => {
    await seedRunningExposure(client);
    await client.query(
      `UPDATE generation_attempts SET status='failed',finished_at=now() WHERE id=$1`,
      [ATTEMPT_A],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    const invocations = createWorkflowInvocationService(createUnitOfWork(prisma));
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await jobs.finish({ ...claim.identity, status: 'failed' });
      await client.query(
        `INSERT INTO credit_ledger
           (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
         VALUES ('divergent-final-close',$1,$2,$3,NULL,'release','credit',999,$4,now())`,
        [ids.userA, ids.projectA, RESERVATION_ID, `release:${RESERVATION_ID}:final-close`],
      );

      await expect(
        invocations.finalizeAttempt({
          ...claim.identity,
          invocationId: INVOCATION_ID,
          attemptId: ATTEMPT_B,
          status: 'failed',
          providerRequestId: 'provider-conflict',
          resultHash: null,
          schemaVersion: 1,
          payload: { late: true },
          usage,
        }),
      ).rejects.toThrow('terminal reconciliation release binding_invalid');

      expect(
        (
          await client.query(
            `SELECT status,released_micro_idr::text,exposure_micro_idr::text,
                    (SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) AS usage_count
               FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID, ATTEMPT_B],
          )
        ).rows[0],
      ).toMatchObject({
        status: 'closing',
        released_micro_idr: '0',
        exposure_micro_idr: '1000',
        usage_count: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);
