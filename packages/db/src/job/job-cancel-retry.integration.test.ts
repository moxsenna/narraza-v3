import { expect, vi } from 'vitest';
import { createJobService } from '@narraza/application';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  dbNowSnapshot,
  fetchJobRow,
  insertQueuedJobRow,
  insertReservationBinding,
  jobIds,
  leaseTokens,
  setRunning,
  setTerminal,
} from './job-test-fixtures.js';

const schema = createSchemaTestSuite();

async function ledgerRows(
  client: Parameters<typeof seedUsersAndProjects>[0],
  reservationId: string,
) {
  return (
    await client.query(
      `SELECT entry_type,direction,amount_micro_idr,dedupe_key
       FROM credit_ledger WHERE reservation_id = $1 ORDER BY created_at,id`,
      [reservationId],
    )
  ).rows;
}

schema.test('cancel-queued', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA, fenceVersion: 8 });
  await insertReservationBinding(client, {
    reservationId: jobIds.reservation,
    jobId: jobIds.a,
    projectId: ids.projectA,
    userId: ids.userA,
    reservedMicroIdr: 2400n,
  });
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createJobService(createUnitOfWork(prisma));
  try {
    const before = await dbNowSnapshot(client);
    await expect(
      service.cancel({ projectId: ids.projectA, jobId: jobIds.a }),
    ).resolves.toMatchObject({
      kind: 'cancelled',
      job: { status: 'cancelled', fenceVersion: 8 },
    });
    const after = await dbNowSnapshot(client);
    const reservation = (
      await client.query(
        `SELECT status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at
         FROM credit_reservations WHERE id=$1`,
        [jobIds.reservation],
      )
    ).rows[0];
    expect(reservation).toMatchObject({
      status: 'cancelled',
      reserved_micro_idr: '2400',
      settled_micro_idr: '0',
      released_micro_idr: '2400',
      exposure_micro_idr: '0',
    });
    expect(reservation.closing_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(reservation.closing_at.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(await ledgerRows(client, jobIds.reservation)).toEqual([
      expect.objectContaining({
        entry_type: 'release',
        direction: 'credit',
        amount_micro_idr: '2400',
        dedupe_key: `release:${jobIds.reservation}:queued-cancel`,
      }),
    ]);
    expect(
      await createUnitOfWork(prisma).execute((p) => p.job.listActiveByProject(ids.projectA)),
    ).toEqual([]);
    await expect(service.cancel({ projectId: ids.projectA, jobId: jobIds.a })).resolves.toEqual({
      kind: 'already_terminal',
      status: 'cancelled',
    });
    expect(await ledgerRows(client, jobIds.reservation)).toHaveLength(1);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  'cancel-queued locks job before reciprocal reservation and claim race has only legal outcomes',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await insertReservationBinding(client, {
      reservationId: jobIds.reservation,
      jobId: jobIds.a,
      projectId: ids.projectA,
      userId: ids.userA,
    });
    const blocker = await client.connect();
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM generation_jobs WHERE id=$1 FOR UPDATE', [jobIds.a]);
      const cancellation = createJobService(createUnitOfWork(prisma)).cancel({
        projectId: ids.projectA,
        jobId: jobIds.a,
      });
      await blocker.query('SELECT pg_sleep(0.2)');
      const waiting = (
        await client.query(
          `SELECT query FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%credit_reservations%'`,
        )
      ).rows;
      expect(waiting).toEqual([]);
      await blocker.query('COMMIT');
      const [cancel, claim] = await Promise.all([
        cancellation,
        createJobService(createUnitOfWork(prisma)).claim({
          projectId: ids.projectA,
          leaseToken: leaseTokens.bob,
          leaseDurationMs: 30_000,
        }),
      ]);
      expect([[cancel.kind, claim.kind]]).toEqual(
        expect.arrayContaining([
          [
            expect.stringMatching(/cancelled|state_conflict/),
            expect.stringMatching(/none|claimed/),
          ],
        ]),
      );
      const row = await fetchJobRow(client, jobIds.a);
      expect(['cancelled', 'running']).toContain(row?.status);
      if (row?.status === 'cancelled')
        expect(await ledgerRows(client, jobIds.reservation)).toHaveLength(1);
      if (row?.status === 'running')
        expect(await ledgerRows(client, jobIds.reservation)).toHaveLength(0);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await prisma.$disconnect();
    }
  },
  15_000,
);

schema.test(
  'cancel-queued wrong reciprocal binding does not lock unrelated reservation and rolls back',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await insertQueuedJobRow(client, { id: jobIds.b, projectId: ids.projectA });
    await insertReservationBinding(client, {
      reservationId: jobIds.reservation,
      jobId: jobIds.b,
      projectId: ids.projectA,
      userId: ids.userA,
    });
    await client.query(
      `ALTER TABLE generation_jobs DROP CONSTRAINT generation_jobs_reservation_binding_fkey`,
    );
    await client.query(`UPDATE generation_jobs SET reservation_id=$1 WHERE id=$2`, [
      jobIds.reservation,
      jobIds.a,
    ]);
    const blocker = await client.connect();
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await blocker.query('BEGIN');
      await blocker.query(`SELECT id FROM credit_reservations WHERE id=$1 FOR UPDATE`, [
        jobIds.reservation,
      ]);
      const cancellation = createJobService(createUnitOfWork(prisma)).cancel({
        projectId: ids.projectA,
        jobId: jobIds.a,
      });
      await expect(
        Promise.race([
          cancellation,
          new Promise((resolve) => setTimeout(() => resolve({ kind: 'blocked' }), 500)),
        ]),
      ).resolves.toEqual({ kind: 'ledger_binding_invalid' });
      expect((await fetchJobRow(client, jobIds.a))?.status).toBe('queued');
      expect((await fetchJobRow(client, jobIds.b))?.status).toBe('queued');
      expect(
        (
          await client.query(`SELECT status FROM credit_reservations WHERE id=$1`, [
            jobIds.reservation,
          ])
        ).rows[0].status,
      ).toBe('open');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await prisma.$disconnect();
    }
  },
  15_000,
);

schema.test(
  'cancel-queued conflicting ledger dedupe rolls back reservation and job',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await insertReservationBinding(client, {
      reservationId: jobIds.reservation,
      jobId: jobIds.a,
      projectId: ids.projectA,
      userId: ids.userA,
      reservedMicroIdr: 2400n,
    });
    await client.query(
      `INSERT INTO credit_ledger
         (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
          amount_micro_idr,dedupe_key,created_at)
       VALUES ($1,$2,$3,$4,NULL,'release','credit',1,$5,now())`,
      [
        jobIds.c,
        ids.userA,
        ids.projectA,
        jobIds.reservationOther,
        `release:${jobIds.reservation}:queued-cancel`,
      ],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await expect(
        createJobService(createUnitOfWork(prisma)).cancel({
          projectId: ids.projectA,
          jobId: jobIds.a,
        }),
      ).resolves.toEqual({ kind: 'ledger_binding_invalid' });
      expect((await fetchJobRow(client, jobIds.a))?.status).toBe('queued');
      expect(
        (
          await client.query(
            `SELECT status,released_micro_idr,exposure_micro_idr FROM credit_reservations WHERE id=$1`,
            [jobIds.reservation],
          )
        ).rows[0],
      ).toEqual({ status: 'open', released_micro_idr: '0', exposure_micro_idr: '2400' });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test('cancel-queued exact release repeat is idempotent', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
  await insertReservationBinding(client, {
    reservationId: jobIds.reservation,
    jobId: jobIds.a,
    projectId: ids.projectA,
    userId: ids.userA,
    reservedMicroIdr: 2400n,
  });
  await client.query(
    `UPDATE credit_reservations
          SET status='cancelled', released_micro_idr=reserved_micro_idr,
              exposure_micro_idr=0, closing_at=now(), updated_at=now()
        WHERE id=$1`,
    [jobIds.reservation],
  );
  await client.query(
    `INSERT INTO credit_ledger
         (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
          amount_micro_idr,dedupe_key,created_at)
       VALUES ($1,$2,$3,$4,NULL,'release','credit',2400,$5,now())`,
    [
      jobIds.c,
      ids.userA,
      ids.projectA,
      jobIds.reservation,
      `release:${jobIds.reservation}:queued-cancel`,
    ],
  );
  const prisma = createPrismaForUrl(databaseUrl);
  try {
    await expect(
      createUnitOfWork(prisma).execute((ports) =>
        ports.ledger.releaseQueuedCancellation({
          projectId: ids.projectA,
          jobId: jobIds.a,
          reservationId: jobIds.reservation,
          ledgerEntryId: jobIds.c,
          dedupeKey: `release:${jobIds.reservation}:queued-cancel`,
          entryType: 'release',
          direction: 'credit',
        }),
      ),
    ).resolves.toEqual({ kind: 'already_released' });
    expect(await ledgerRows(client, jobIds.reservation)).toHaveLength(1);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('retry-new-job', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, {
    id: jobIds.a,
    projectId: ids.projectA,
    priority: 4,
    schemaVersion: 3,
    payload: '{"safe":"context"}',
  });
  await setTerminal(client, jobIds.a, 'failed');
  const prisma = createPrismaForUrl(databaseUrl);
  try {
    const result = await createJobService(createUnitOfWork(prisma)).manualRetry({
      projectId: ids.projectA,
      sourceJobId: jobIds.a,
      availableInMs: 1000,
      reservationId: null,
    });
    expect(result).toMatchObject({
      kind: 'created',
      job: {
        status: 'queued',
        retryOfJobId: jobIds.a,
        reservationId: null,
        fenceVersion: 0,
        leaseToken: null,
        cancelRequestedAt: null,
        payload: { safe: 'context' },
      },
    });
    if (result.kind === 'created') expect(result.job.id).not.toBe(jobIds.a);
    expect((await fetchJobRow(client, jobIds.a))?.status).toBe('failed');
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  'retry-new-job rejects nonretryable and foreign sources',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    for (const [id, status] of [
      [jobIds.a, 'queued'],
      [jobIds.b, 'running'],
      [jobIds.c, 'succeeded'],
    ] as const) {
      await insertQueuedJobRow(client, { id, projectId: ids.projectA });
      if (status === 'running') await setRunning(client, id, leaseTokens.alice, 30_000);
      else if (status === 'succeeded') await setTerminal(client, id, status);
    }
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      await expect(
        service.manualRetry({
          projectId: ids.projectA,
          sourceJobId: jobIds.a,
          availableInMs: 0,
          reservationId: null,
        }),
      ).resolves.toMatchObject({ kind: 'source_not_terminal' });
      await expect(
        service.manualRetry({
          projectId: ids.projectA,
          sourceJobId: jobIds.b,
          availableInMs: 0,
          reservationId: null,
        }),
      ).resolves.toMatchObject({ kind: 'source_not_terminal' });
      await expect(
        service.manualRetry({
          projectId: ids.projectA,
          sourceJobId: jobIds.c,
          availableInMs: 0,
          reservationId: null,
        }),
      ).resolves.toMatchObject({ kind: 'source_not_retryable' });
      await expect(
        service.manualRetry({
          projectId: ids.projectB,
          sourceJobId: jobIds.a,
          availableInMs: 0,
          reservationId: null,
        }),
      ).resolves.toEqual({ kind: 'not_found' });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'retry-new-job duplicate allocated ID returns conflict and commits without mutation',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setTerminal(client, jobIds.a, 'failed');
    await insertQueuedJobRow(client, { id: jobIds.retry, projectId: ids.projectA });
    const sourceBefore = await fetchJobRow(client, jobIds.a);
    const existingBefore = await fetchJobRow(client, jobIds.retry);
    const randomUuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(jobIds.retry);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await expect(
        createJobService(createUnitOfWork(prisma)).manualRetry({
          projectId: ids.projectA,
          sourceJobId: jobIds.a,
          availableInMs: 0,
          reservationId: null,
        }),
      ).resolves.toEqual({ kind: 'conflict' });
      expect(await fetchJobRow(client, jobIds.a)).toEqual(sourceBefore);
      expect(await fetchJobRow(client, jobIds.retry)).toEqual(existingBefore);
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM generation_jobs`)).rows[0].count,
      ).toBe(2);
    } finally {
      randomUuid.mockRestore();
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'retry-new-job invalid explicit reservation returns typed result and commits without mutation',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setTerminal(client, jobIds.a, 'dead');
    await client.query(
      `INSERT INTO credit_reservations (id,user_id,project_id,status,reserved_micro_idr,exposure_micro_idr,updated_at) VALUES ($1,$2,$3,'open',500,500,now())`,
      [jobIds.reservationOther, ids.userB, ids.projectB],
    );
    const sourceBefore = await fetchJobRow(client, jobIds.a);
    const reservationBefore = (
      await client.query(`SELECT * FROM credit_reservations WHERE id=$1`, [jobIds.reservationOther])
    ).rows[0];
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      await expect(
        createJobService(createUnitOfWork(prisma)).manualRetry({
          projectId: ids.projectA,
          sourceJobId: jobIds.a,
          availableInMs: 0,
          reservationId: jobIds.reservationOther,
        }),
      ).resolves.toEqual({ kind: 'reservation_binding_invalid' });
      expect(await fetchJobRow(client, jobIds.a)).toEqual(sourceBefore);
      expect(
        (
          await client.query(`SELECT * FROM credit_reservations WHERE id=$1`, [
            jobIds.reservationOther,
          ])
        ).rows[0],
      ).toEqual(reservationBefore);
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS count FROM generation_jobs WHERE retry_of_job_id=$1`,
            [jobIds.a],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'retry-new-job binds explicit fresh reservation reciprocally and invalid binding rolls back',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    await insertQueuedJobRow(client, { id: jobIds.a, projectId: ids.projectA });
    await setTerminal(client, jobIds.a, 'dead');
    await client.query(
      `INSERT INTO credit_reservations (id,user_id,project_id,status,reserved_micro_idr,exposure_micro_idr,updated_at) VALUES ($1,$2,$3,'open',500,500,now())`,
      [jobIds.reservation, ids.userA, ids.projectA],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const created = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: jobIds.a,
        availableInMs: 0,
        reservationId: jobIds.reservation,
      });
      expect(created.kind).toBe('created');
      if (created.kind === 'created') {
        const binding = (
          await client.query(
            `SELECT project_id,job_project_id,job_id FROM credit_reservations WHERE id=$1`,
            [jobIds.reservation],
          )
        ).rows[0];
        expect(binding).toEqual({
          project_id: ids.projectA,
          job_project_id: ids.projectA,
          job_id: created.job.id,
        });
        expect(created.job.reservationId).toBe(jobIds.reservation);
      }
      await client.query(
        `INSERT INTO credit_reservations (id,user_id,project_id,status,reserved_micro_idr,exposure_micro_idr,updated_at) VALUES ($1,$2,$3,'open',500,500,now())`,
        [jobIds.reservationOther, ids.userB, ids.projectB],
      );
      const invalid = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: jobIds.a,
        availableInMs: 0,
        reservationId: jobIds.reservationOther,
      });
      expect(invalid).toEqual({ kind: 'reservation_binding_invalid' });
      expect(
        (
          await client.query(
            `SELECT count(*)::int AS count FROM generation_jobs WHERE retry_of_job_id=$1`,
            [jobIds.a],
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  },
);
