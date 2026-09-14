/**
 * Grant ledger integration (R1 sell-unlock): exactly-once new-user grant
 * against real PostgreSQL, including CHECK-constraint vocabulary.
 */
import { expect, describe } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const GRANT_USER_ID = 'grant-user-a';

async function seedGrantUser(prisma: PrismaClient) {
  await prisma.$queryRawUnsafe(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (id) DO NOTHING`,
    GRANT_USER_ID,
    'grant@narraza.test',
    'hashed:x',
    'active',
  );
  return { userId: GRANT_USER_ID };
}

describe('Ledger grant gates', () => {
  const schema = createSchemaTestSuite();

  schema.test('grant appends once, replay converges', async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);
    try {
      const { userId } = await seedGrantUser(prisma);
      const input = {
        userId,
        projectId: null,
        ledgerEntryId: 'grant-entry-01',
        amountMicroIdr: 1000000000n,
        dedupeKey: `grant:new-user:${userId}`,
      } as const;
      const first = await createUnitOfWork(prisma).execute(async (ports) =>
        ports.ledger.appendGrant(input),
      );
      expect(first).toEqual({ kind: 'granted' });
      const second = await createUnitOfWork(prisma).execute(async (ports) =>
        ports.ledger.appendGrant({ ...input, ledgerEntryId: 'grant-entry-02' }),
      );
      expect(second).toEqual({ kind: 'already_granted' });
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM credit_ledger WHERE dedupe_key = $1`,
        input.dedupeKey,
      )) as Array<{ n: number }>;
      expect(rows[0]?.n).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  schema.test('divergent grant replay is binding_invalid', async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);
    try {
      const { userId } = await seedGrantUser(prisma);
      const dedupeKey = `grant:new-user:${userId}`;
      await createUnitOfWork(prisma).execute(async (ports) =>
        ports.ledger.appendGrant({
          userId,
          projectId: null,
          ledgerEntryId: 'grant-entry-10',
          amountMicroIdr: 1000000000n,
          dedupeKey,
        }),
      );
      const divergent = await createUnitOfWork(prisma).execute(async (ports) =>
        ports.ledger.appendGrant({
          userId,
          projectId: null,
          ledgerEntryId: 'grant-entry-11',
          amountMicroIdr: 2000000000n,
          dedupeKey,
        }),
      );
      expect(divergent).toEqual({ kind: 'binding_invalid' });
    } finally {
      await prisma.$disconnect();
    }
  });

  schema.test('non-positive grant amount is binding_invalid', async ({ databaseUrl }) => {
    const prisma = createPrismaClient(databaseUrl);
    try {
      const { userId } = await seedGrantUser(prisma);
      const result = await createUnitOfWork(prisma).execute(async (ports) =>
        ports.ledger.appendGrant({
          userId,
          projectId: null,
          ledgerEntryId: 'grant-entry-20',
          amountMicroIdr: 0n,
          dedupeKey: `grant:new-user:${userId}`,
        }),
      );
      expect(result).toEqual({ kind: 'binding_invalid' });
    } finally {
      await prisma.$disconnect();
    }
  });
});
