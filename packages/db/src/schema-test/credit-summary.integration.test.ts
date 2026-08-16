import { expect } from 'vitest';
import { createCreditSummaryService } from '@narraza/application';
import { Client } from 'pg';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';

const schema = createSchemaTestSuite();

const M = 10_000_000n; // MICRO_IDR_PER_CREDIT

interface LedgerSeed {
  readonly id: string;
  readonly userId: string;
  readonly entryType: string;
  readonly direction: 'debit' | 'credit';
  readonly amountMicroIdr: bigint;
  readonly dedupeKey: string;
}

async function seedLedgerEntry(client: Parameters<typeof seedUsersAndProjects>[0], seed: LedgerSeed) {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [seed.id, seed.userId, seed.entryType, seed.direction, seed.amountMicroIdr, seed.dedupeKey],
  );
}

interface ReservationSeed {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly status: 'open' | 'closing' | 'settled' | 'released' | 'cancelled' | 'expired';
  readonly fundingModel: 'user_paid' | 'system_funded' | null;
  readonly reservedMicroIdr: bigint;
  readonly settledMicroIdr?: bigint;
  readonly releasedMicroIdr?: bigint;
  readonly exposureMicroIdr?: bigint;
}

async function seedReservation(client: Parameters<typeof seedUsersAndProjects>[0], seed: ReservationSeed) {
  const settled = seed.settledMicroIdr ?? 0n;
  const released = seed.releasedMicroIdr ?? 0n;
  const exposure =
    seed.exposureMicroIdr ?? (seed.status === 'open' || seed.status === 'closing' ? seed.reservedMicroIdr : 0n);
  // Terminal/closing states require closing_at per credit_reservations_lifecycle_check.
  const closingAt = seed.status === 'open' ? null : 'now()';
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,
        released_micro_idr,exposure_micro_idr,closing_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,${closingAt},now(),now())`,
    [
      seed.id,
      seed.userId,
      seed.projectId,
      seed.status,
      seed.fundingModel,
      seed.reservedMicroIdr,
      settled,
      released,
      exposure,
    ],
  );
}

schema.test(
  'ledger vocabulary matrix drives book exactly; release excluded; users isolated',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    // Book contributions for user A (micro-IDR):
    // +grant 7,000,000 +refund 3,000,000 +credit adjustment 2,000,000
    // -legacy charge 1,000,000 -reservation_settlement 2,500,000 -debit adjustment 500,000
    // release 4,000,000 credit row must be EXCLUDED from book.
    const entries: LedgerSeed[] = [
      { id: 'l-grant', userId: ids.userA, entryType: 'grant', direction: 'credit', amountMicroIdr: 7_000_000n, dedupeKey: 'dk-grant' },
      { id: 'l-refund', userId: ids.userA, entryType: 'refund', direction: 'credit', amountMicroIdr: 3_000_000n, dedupeKey: 'dk-refund' },
      { id: 'l-adj-credit', userId: ids.userA, entryType: 'adjustment', direction: 'credit', amountMicroIdr: 2_000_000n, dedupeKey: 'dk-adj-c' },
      { id: 'l-charge-legacy', userId: ids.userA, entryType: 'charge', direction: 'debit', amountMicroIdr: 1_000_000n, dedupeKey: 'dk-charge' },
      { id: 'l-settle', userId: ids.userA, entryType: 'reservation_settlement', direction: 'debit', amountMicroIdr: 2_500_000n, dedupeKey: 'dk-settle' },
      { id: 'l-adj-debit', userId: ids.userA, entryType: 'adjustment', direction: 'debit', amountMicroIdr: 500_000n, dedupeKey: 'dk-adj-d' },
      { id: 'l-release', userId: ids.userA, entryType: 'release', direction: 'credit', amountMicroIdr: 4_000_000n, dedupeKey: 'dk-release' },
      // User B noise must never touch user A's book (matrix #19).
      { id: 'l-b-grant', userId: ids.userB, entryType: 'grant', direction: 'credit', amountMicroIdr: 99_000_000n, dedupeKey: 'dk-b-grant' },
    ];
    for (const entry of entries) {
      await seedLedgerEntry(client, entry);
    }

    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const snapshotFor = (userId: string) =>
      uow.execute((ports) => ports.creditBalance.getBalanceSnapshot(userId));
    const summary = createCreditSummaryService(uow);

    try {
      const snapshotA = await snapshotFor(ids.userA);
      // 7,000,000 + 3,000,000 + 2,000,000 - 1,000,000 - 2,500,000 - 500,000 = 8,000,000
      expect(snapshotA).toEqual({
        bookMicroIdr: 8_000_000n,
        heldMicroIdr: 0n,
        reconcilingMicroIdr: 0n,
      });

      const snapshotB = await snapshotFor(ids.userB);
      expect(snapshotB.bookMicroIdr).toBe(99_000_000n);

      // Canonical view derives from the same single snapshot (#20): 8,000,000 micro = 0.8 credit.
      const viewA = await summary.getSummary({ userId: ids.userA });
      expect(viewA).toEqual({ available: 0n, held: 0n, reconciling: 0n });
      const viewB = await summary.getSummary({ userId: ids.userB });
      expect(viewB.available).toBe(9n);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'reservation exposure matrix drives held/reconciling; system_funded and terminal excluded',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    // (#8) open user_paid 2,000,000 -> held
    await seedReservation(client, { id: 'r-open-paid', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: 'user_paid', reservedMicroIdr: 2_000_000n });
    // (#9) closing user_paid 3,000,000 -> reconciling
    await seedReservation(client, { id: 'r-closing-paid', userId: ids.userA, projectId: ids.projectA, status: 'closing', fundingModel: 'user_paid', reservedMicroIdr: 3_000_000n, exposureMicroIdr: 3_000_000n });
    // (#10) open system_funded 50,000,000 -> neither
    await seedReservation(client, { id: 'r-open-sys', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: 'system_funded', reservedMicroIdr: 50_000_000n });
    // (#11) closing system_funded 60,000,000 -> neither
    await seedReservation(client, { id: 'r-closing-sys', userId: ids.userA, projectId: ids.projectA, status: 'closing', fundingModel: 'system_funded', reservedMicroIdr: 60_000_000n, exposureMicroIdr: 60_000_000n });
    // (#12) NULL legacy open 1,500,000 -> held (legacy user-credit compatibility)
    await seedReservation(client, { id: 'r-open-legacy', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: null, reservedMicroIdr: 1_500_000n });
    // NULL legacy closing 2,500,000 -> reconciling
    await seedReservation(client, { id: 'r-closing-legacy', userId: ids.userA, projectId: ids.projectA, status: 'closing', fundingModel: null, reservedMicroIdr: 2_500_000n, exposureMicroIdr: 2_500_000n });
    // (#13) terminal states never create held/reconciling display
    await seedReservation(client, { id: 'r-settled', userId: ids.userA, projectId: ids.projectA, status: 'settled', fundingModel: 'user_paid', reservedMicroIdr: 4_000_000n, settledMicroIdr: 4_000_000n });
    await seedReservation(client, { id: 'r-released', userId: ids.userA, projectId: ids.projectA, status: 'released', fundingModel: 'user_paid', reservedMicroIdr: 5_000_000n, releasedMicroIdr: 5_000_000n });
    await seedReservation(client, { id: 'r-cancelled', userId: ids.userA, projectId: ids.projectA, status: 'cancelled', fundingModel: 'user_paid', reservedMicroIdr: 6_000_000n, releasedMicroIdr: 6_000_000n });
    await seedReservation(client, { id: 'r-expired', userId: ids.userA, projectId: ids.projectA, status: 'expired', fundingModel: 'user_paid', reservedMicroIdr: 7_000_000n, releasedMicroIdr: 7_000_000n });
    // (#19) user B reservation must not leak into user A summary
    await seedReservation(client, { id: 'r-b-open', userId: ids.userB, projectId: ids.projectB, status: 'open', fundingModel: 'user_paid', reservedMicroIdr: 80_000_000n });

    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const summary = createCreditSummaryService(uow);

    try {
      const snapshotA = await uow.execute((ports) =>
        ports.creditBalance.getBalanceSnapshot(ids.userA),
      );
      // held = 2,000,000 + 1,500,000 = 3,500,000
      // reconciling = 3,000,000 + 2,500,000 = 5,500,000
      expect(snapshotA).toEqual({
        bookMicroIdr: 0n,
        heldMicroIdr: 3_500_000n,
        reconcilingMicroIdr: 5_500_000n,
      });

      const snapshotB = await uow.execute((ports) =>
        ports.creditBalance.getBalanceSnapshot(ids.userB),
      );
      expect(snapshotB.heldMicroIdr).toBe(80_000_000n);
      expect(snapshotB.reconcilingMicroIdr).toBe(0n);

      const viewA = await summary.getSummary({ userId: ids.userA });
      expect(viewA).toEqual({ available: 0n, held: 1n, reconciling: 1n });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'credit view conversion boundaries: subtract-before-floor, ceil, clamp, huge bigint',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    // (#14) book = 10,000,001; open user_paid exposure = 1.
    // Frozen: floor((10,000,001 - 1)/M) = 1. Separate conversion would give floor(book)=1 - ceil(held)=1 -> 0.
    await seedLedgerEntry(client, { id: 'l-bound-grant', userId: ids.userA, entryType: 'grant', direction: 'credit', amountMicroIdr: 10_000_001n, dedupeKey: 'dk-bound-grant' });
    await seedReservation(client, { id: 'r-bound-hold', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: 'user_paid', reservedMicroIdr: 1n });

    const prisma = createPrismaForUrl(databaseUrl);
    const summary = createCreditSummaryService(createUnitOfWork(prisma));

    try {
      const boundary = await summary.getSummary({ userId: ids.userA });
      expect(boundary).toEqual({ available: 1n, held: 1n, reconciling: 0n });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'negative available clamps to zero while held/reconciling still display',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    // book = 3,000,000; held = 5,000,000 -> availableMicro = -2,000,000 -> available clamps to 0 (#17)
    await seedLedgerEntry(client, { id: 'l-neg-grant', userId: ids.userA, entryType: 'grant', direction: 'credit', amountMicroIdr: 3_000_000n, dedupeKey: 'dk-neg-grant' });
    await seedReservation(client, { id: 'r-neg-hold', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: 'user_paid', reservedMicroIdr: 5_000_000n });

    const prisma = createPrismaForUrl(databaseUrl);
    const summary = createCreditSummaryService(createUnitOfWork(prisma));

    try {
      const view = await summary.getSummary({ userId: ids.userA });
      expect(view).toEqual({ available: 0n, held: 1n, reconciling: 0n });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test('huge bigint values remain exact end to end (#18)', async ({ client, databaseUrl }) => {
  await seedUsersAndProjects(client);
  const hugeGrant = 9_000_000_000_000_000_000n; // 9e18 micro-IDR (fits PostgreSQL BIGINT)
  const hugeHold = 1_000_000_000_000_000_001n;
  await seedLedgerEntry(client, { id: 'l-huge-grant', userId: ids.userA, entryType: 'grant', direction: 'credit', amountMicroIdr: hugeGrant, dedupeKey: 'dk-huge-grant' });
  await seedReservation(client, { id: 'r-huge-hold', userId: ids.userA, projectId: ids.projectA, status: 'open', fundingModel: 'user_paid', reservedMicroIdr: hugeHold });

  const prisma = createPrismaForUrl(databaseUrl);
  const uow = createUnitOfWork(prisma);
  const summary = createCreditSummaryService(uow);

  try {
    const snapshot = await uow.execute((ports) => ports.creditBalance.getBalanceSnapshot(ids.userA));
    expect(snapshot).toEqual({
      bookMicroIdr: hugeGrant,
      heldMicroIdr: hugeHold,
      reconcilingMicroIdr: 0n,
    });
    const view = await summary.getSummary({ userId: ids.userA });
    expect(view.available).toBe((hugeGrant - hugeHold) / M);
    expect(view.held).toBe((hugeHold + M - 1n) / M);
    expect(view.reconciling).toBe(0n);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test(
  'concurrent settlement never exposes a torn balance tuple (single-statement snapshot)',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);
    // Coherent pre-settlement state: book = 10,000,000 grant;
    // closing user_paid reservation with 4,000,000 exposure.
    await seedLedgerEntry(client, { id: 'l-cc-grant', userId: ids.userA, entryType: 'grant', direction: 'credit', amountMicroIdr: 10_000_000n, dedupeKey: 'dk-cc-grant' });
    await seedReservation(client, { id: 'r-cc-closing', userId: ids.userA, projectId: ids.projectA, status: 'closing', fundingModel: 'user_paid', reservedMicroIdr: 4_000_000n, exposureMicroIdr: 4_000_000n });

    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const summary = createCreditSummaryService(uow);
    const snapshotFor = () =>
      uow.execute((ports) => ports.creditBalance.getBalanceSnapshot(ids.userA));

    // Connection B mutates reservation financial state AND appends its ledger
    // settlement inside one transaction, held uncommitted.
    const txB = new Client({ connectionString: databaseUrl });
    await txB.connect();
    await txB.query('BEGIN');
    await txB.query(
      `UPDATE credit_reservations
          SET status='settled', settled_micro_idr=4000000, exposure_micro_idr=0, closing_at=now(), updated_at=now()
        WHERE id='r-cc-closing'`,
    );
    await txB.query(
      `INSERT INTO credit_ledger
         (id,user_id,reservation_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('l-cc-settle',$1,'r-cc-closing','reservation_settlement','debit',4000000,'dk-cc-settle',now())`,
      [ids.userA],
    );

    try {
      // While Tx B is uncommitted, the summary sees the complete OLD tuple —
      // never book=6,000,000 mixed with reconciling=4,000,000 (or the reverse).
      const oldSnapshot = await snapshotFor();
      expect(oldSnapshot).toEqual({
        bookMicroIdr: 10_000_000n,
        heldMicroIdr: 0n,
        reconcilingMicroIdr: 4_000_000n,
      });
      const oldView = await summary.getSummary({ userId: ids.userA });
      expect(oldView).toEqual({ available: 0n, held: 0n, reconciling: 1n });

      await txB.query('COMMIT');

      // After commit, the summary sees the complete NEW tuple.
      const newSnapshot = await snapshotFor();
      expect(newSnapshot).toEqual({
        bookMicroIdr: 6_000_000n,
        heldMicroIdr: 0n,
        reconcilingMicroIdr: 0n,
      });
      const newView = await summary.getSummary({ userId: ids.userA });
      expect(newView).toEqual({ available: 0n, held: 0n, reconciling: 0n });
    } finally {
      await txB.end().catch(() => undefined);
      await prisma.$disconnect();
    }
  },
);

schema.test('funding_model CHECK accepts only user_paid, system_funded, or NULL', async ({ client }) => {
  await seedUsersAndProjects(client);
  await expect(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('r-bad-funding',$1,$2,'open','nonsense',1000,0,0,1000,now(),now())`,
      [ids.userA, ids.projectA],
    ),
  ).rejects.toMatchObject({
    code: '23514',
    constraint: 'credit_reservations_funding_model_check',
  });
});
