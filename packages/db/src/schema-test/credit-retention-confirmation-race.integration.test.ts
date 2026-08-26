import {
  createCreditQuoteConfirmationService,
  createCreditRetentionService,
  type CreateConfirmationInput,
  type UnitOfWork,
} from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createUnitOfWork, Prisma } from '../unit-of-work.js';
import { createTxPorts } from '../repos/create-tx-ports.js';
import { ids, seedUsersAndProjects } from './fixtures.js';
import { createSchemaTestSuite } from './harness.js';

// Task 13A certification barrier: production CreditQuote confirmation service
// versus production CreditRetentionService on real PostgreSQL. The confirmation
// side runs the real Task 6 application entry point over real adapters; the
// pausing unit of work only orchestrates COMMIT timing so the interleaving is
// deterministic. No confirmation SQL is emulated.

const suite = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const QUOTE_ID = '61000000-0000-4000-8000-000000000001';
const RESERVATION_ID = '62000000-0000-4000-8000-000000000001';
const JOB_ID = '63000000-0000-4000-8000-000000000001';
const REQUEST_ID = '64000000-0000-4000-8000-000000000001';

interface Gate {
  readonly promise: Promise<void>;
  open: () => void;
}

function gate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, open: release };
}

type PausingUnitOfWorkOptions = {
  readonly pauseBeforeCallback?: boolean;
  readonly onHolding?: () => void;
};

function createPausingUnitOfWork(
  prisma: ReturnType<typeof createPrismaForUrl>,
  hold: Gate,
  options: PausingUnitOfWorkOptions = {},
): UnitOfWork {
  return {
    async execute(fn, opts = {}) {
      const isolation =
        opts.isolation === 'serializable'
          ? Prisma.TransactionIsolationLevel.Serializable
          : Prisma.TransactionIsolationLevel.ReadCommitted;
      return prisma.$transaction(
        async (tx) => {
          if (options.pauseBeforeCallback === true) await hold.promise;
          const result = await fn(createTxPorts(tx));
          if (options.pauseBeforeCallback !== true) {
            options.onHolding?.();
            await hold.promise;
          }
          return result;
        },
        { isolationLevel: isolation },
      );
    },
  };
}

async function seedRaceBase(client: Pool): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('race-opening-grant',$1,$2,NULL,NULL,'grant','credit',5000,'race-opening-grant',now())`,
    [ids.userA, ids.projectA],
  );
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,
        expires_at,consumed_at,created_at)
     VALUES ($1,$2,$3,$4,$5,100,NOW() + interval '1 hour',NULL,NOW() - interval '25 hours')`,
    [QUOTE_ID, ids.userA, ids.projectA, HASH_A, HASH_B],
  );
}

function confirmationInput(): CreateConfirmationInput {
  return {
    userId: ids.userA,
    projectId: ids.projectA,
    quoteId: QUOTE_ID,
    confirmationRequestId: REQUEST_ID,
    expectedWorkflowPlanHash: HASH_A,
    expectedDependencyHash: HASH_B,
    reservationId: RESERVATION_ID,
    jobId: JOB_ID,
    jobKind: 'scene_generation',
    bundleId: null,
    workflowPlanId: null,
    payload: {},
  };
}

async function sweep(
  databaseUrl: string,
  input: { maxAgeHours?: number; batchSize?: number } = {},
) {
  const prisma = createPrismaForUrl(databaseUrl);
  try {
    return await createCreditRetentionService(createUnitOfWork(prisma)).sweepCreditRetention(input);
  } finally {
    await prisma.$disconnect();
  }
}

interface ReservationRow {
  readonly status: string;
  readonly funding_model: string | null;
  readonly reserved_micro_idr: string;
  readonly settled_micro_idr: string;
  readonly released_micro_idr: string;
  readonly exposure_micro_idr: string;
  readonly closing_at: Date | null;
  readonly quote_id: string | null;
  readonly job_id: string | null;
}

async function reservationRow(client: Pool, id: string): Promise<ReservationRow | undefined> {
  const result = await client.query(
    `SELECT status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,
            exposure_micro_idr,closing_at,quote_id,job_id
       FROM credit_reservations WHERE id=$1`,
    [id],
  );
  return result.rows[0] as ReservationRow | undefined;
}

suite.test(
  'retention vs confirmation: confirmation holds serialization and commits while a concurrent production sweep skips safely',
  async ({ client, databaseUrl }) => {
    await seedRaceBase(client);

    const prisma = createPrismaForUrl(databaseUrl);
    try {
      let holding = false;
      const hold = gate();
      const confirmation = createCreditQuoteConfirmationService(
        createPausingUnitOfWork(prisma, hold, {
          onHolding: () => {
            holding = true;
          },
        }),
      );

      const confirmPromise = confirmation.confirmQuote(confirmationInput());
      const deadline = Date.now() + 5_000;
      while (!holding && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(holding).toBe(true);

      // Confirmation transaction is open: users row serialized via FOR UPDATE,
      // quote locked via confirmLock, consume CAS + inserts applied, commit held.
      const concurrent = await sweep(databaseUrl);
      expect(concurrent).toEqual({ deletedQuotes: 0, deletedBundles: 0 });

      hold.open();
      const result = await confirmPromise;
      expect(result.kind).toBe('confirmed');

      // Exactly one reservation and one job, reciprocally bound.
      const reservation = await reservationRow(client, RESERVATION_ID);
      expect(reservation).toBeDefined();
      expect(reservation?.status).toBe('open');
      expect(reservation?.funding_model).toBe('user_paid');
      expect(reservation?.closing_at).toBeNull();
      expect(reservation?.quote_id).toBe(QUOTE_ID);
      expect(reservation?.job_id).toBe(JOB_ID);
      const counts = await client.query(
        `SELECT (SELECT count(*) FROM credit_reservations WHERE id=$1) AS reservations,
                (SELECT count(*) FROM generation_jobs WHERE id=$2) AS jobs,
                (SELECT count(*) FROM generation_jobs WHERE reservation_id=$1) AS bound_jobs`,
        [RESERVATION_ID, JOB_ID],
      );
      expect(counts.rows[0]).toMatchObject({ reservations: '1', jobs: '1', bound_jobs: '1' });

      // Conservation on real rows: R = S + L + E with open shape S=0 L=0 E=R.
      expect(Number(reservation?.reserved_micro_idr)).toBe(100);
      expect(Number(reservation?.settled_micro_idr)).toBe(0);
      expect(Number(reservation?.released_micro_idr)).toBe(0);
      expect(Number(reservation?.exposure_micro_idr)).toBe(100);

      // Quote consumed exactly once; balance invariant intact; only the seed
      // grant exists in the ledger (no zero-value or settlement rows yet).
      const integrity = await client.query(
        `SELECT (SELECT count(*) FROM credit_quotes WHERE id=$1 AND consumed_at IS NOT NULL) AS consumed,
                (SELECT count(*) FROM credit_ledger WHERE user_id=$2 AND amount_micro_idr=0) AS zero_rows,
                (SELECT count(*) FROM credit_ledger WHERE user_id=$2) AS ledger_rows`,
        [QUOTE_ID, ids.userA],
      );
      expect(integrity.rows[0]).toMatchObject({ consumed: '1', zero_rows: '0', ledger_rows: '1' });

      // A sweep after commit must not delete the now-consumed quote.
      const afterCommit = await sweep(databaseUrl);
      expect(afterCommit).toEqual({ deletedQuotes: 0, deletedBundles: 0 });

      // Same request replay through the real service stays exact and single.
      const replayPrisma = createPrismaForUrl(databaseUrl);
      try {
        const replay = await createCreditQuoteConfirmationService(
          createUnitOfWork(replayPrisma),
        ).confirmQuote(confirmationInput());
        expect(replay.kind).toBe('exact_replay');
      } finally {
        await replayPrisma.$disconnect();
      }
      const stillOne = await client.query(
        `SELECT (SELECT count(*) FROM credit_reservations WHERE id=$1) AS reservations,
                (SELECT count(*) FROM generation_jobs WHERE id=$2) AS jobs`,
        [RESERVATION_ID, JOB_ID],
      );
      expect(stillOne.rows[0]).toMatchObject({ reservations: '1', jobs: '1' });
    } finally {
      await prisma.$disconnect();
    }
  },
  45_000,
);

suite.test(
  'retention vs confirmation: delete-wins leaves production confirmation typed not_found with zero financial mutation',
  async ({ client, databaseUrl }) => {
    await seedRaceBase(client);

    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const hold = gate();
      const confirmation = createCreditQuoteConfirmationService(
        createPausingUnitOfWork(prisma, hold, { pauseBeforeCallback: true }),
      );

      const confirmPromise = confirmation.confirmQuote(confirmationInput());

      // Retention deletes the eligible unused quote before confirmation's
      // transaction touches any row.
      const deleted = await sweep(databaseUrl);
      expect(deleted).toEqual({ deletedQuotes: 1, deletedBundles: 0 });

      hold.open();
      const result = await confirmPromise;
      expect(result.kind).toBe('not_found');

      const after = await client.query(
        `SELECT (SELECT count(*) FROM credit_reservations WHERE id=$1) AS reservations,
                (SELECT count(*) FROM generation_jobs WHERE id=$2) AS jobs,
                (SELECT count(*) FROM credit_ledger WHERE user_id=$3) AS ledger_rows,
                (SELECT count(*) FROM credit_billing_allocations WHERE project_id=$4) AS allocations`,
        [RESERVATION_ID, JOB_ID, ids.userA, ids.projectA],
      );
      expect(after.rows[0]).toMatchObject({
        reservations: '0',
        jobs: '0',
        ledger_rows: '1',
        allocations: '0',
      });
    } finally {
      await prisma.$disconnect();
    }
  },
  45_000,
);
