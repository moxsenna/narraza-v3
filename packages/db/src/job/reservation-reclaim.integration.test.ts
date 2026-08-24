import { createJobService } from '@narraza/application';
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
const jobId = '7c000000-0000-4000-8000-000000000010';
const reservationId = '7c100000-0000-4000-8000-000000000010';

suite.test(
  'reservation-exposure: expired cancellation reclaims job and reservation atomically',
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
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await jobs.cancel({ projectId: ids.projectA, jobId });
      await client.query(
        `UPDATE generation_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [jobId],
      );
      const before = await client.query(`SELECT now() value`);
      await expect(jobs.reclaimOne({})).resolves.toMatchObject({
        kind: 'cancelled',
        job: { status: 'cancelled' },
      });
      expect(
        (
          await client.query(
            `SELECT j.status job_status,r.status reservation_status,r.settled_micro_idr::text settled,r.released_micro_idr::text released,r.exposure_micro_idr::text exposure,r.closing_at >= $2::timestamptz pg_clock,(SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger FROM generation_jobs j JOIN credit_reservations r ON r.job_id=j.id WHERE r.id=$1`,
            [reservationId, before.rows[0].value],
          )
        ).rows[0],
      ).toMatchObject({
        job_status: 'cancelled',
        reservation_status: 'cancelled',
        settled: '0',
        released: '1000',
        exposure: '0',
        pg_clock: true,
        ledger: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'reservation-exposure: expired requeue preserves open reservation',
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
    const prisma = createPrismaForUrl(databaseUrl);
    const jobs = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await client.query(
        `UPDATE generation_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [jobId],
      );
      await expect(jobs.reclaimOne({})).resolves.toMatchObject({
        kind: 'requeued',
        job: { status: 'queued' },
      });
      expect(
        (
          await client.query(
            `SELECT status,released_micro_idr::text released,exposure_micro_idr::text exposure,closing_at FROM credit_reservations WHERE id=$1`,
            [reservationId],
          )
        ).rows[0],
      ).toMatchObject({ status: 'open', released: '0', exposure: '1000', closing_at: null });
    } finally {
      await prisma.$disconnect();
    }
  },
);
