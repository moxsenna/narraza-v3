import { expect } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createDbAuthAdapters, type DbAuthAdapters } from './index.js';

const schema = createSchemaTestSuite();

type AuthContext = { prisma: PrismaClient; adapters: DbAuthAdapters };

function authTest(
  name: string,
  body: (context: AuthContext) => Promise<void>,
  timeout?: number,
): void {
  schema.test(
    name,
    async ({ databaseUrl }) => {
      const prisma = createPrismaClient(databaseUrl);
      const adapters = createDbAuthAdapters(prisma, {
        idleDays: 14,
        absoluteDays: 30,
        activityWriteHours: 6,
      });
      try {
        await body({ prisma, adapters });
      } finally {
        await prisma.$disconnect();
      }
    },
    timeout,
  );
}

async function insertUser(
  prisma: PrismaClient,
  email: string,
  status = 'pending_verification',
): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO users (id, email, password_hash, status, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'hashed:x', $2::user_status, now(), now())
     RETURNING id`,
    email,
    status,
  );
  return rows[0]!.id;
}

async function insertToken(
  prisma: PrismaClient,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  tokenHash: string,
  ttlMinutes = 60,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO email_action_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
     VALUES (gen_random_uuid()::text, $1, $2::email_token_purpose, $3, now() + make_interval(mins => $4::int), now())`,
    userId,
    purpose,
    tokenHash,
    ttlMinutes,
  );
}

authTest(
  'AuthTransactions consumes a verification token exactly once under concurrency',
  async ({ prisma, adapters }) => {
    const userId = await insertUser(prisma, 'race@narraza.test');
    await insertToken(prisma, userId, 'verify_email', 'hash-verify-race');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => adapters.tx.consumeEmailVerification('hash-verify-race')),
    );
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.userId).toBe(userId);
    const user = await prisma.$queryRawUnsafe<{ status: string; email_verified_at: Date | null }[]>(
      `SELECT status, email_verified_at FROM users WHERE id = $1`,
      userId,
    );
    expect(user[0]!.status).toBe('active');
    expect(user[0]!.email_verified_at).not.toBeNull();
  },
);

authTest(
  'AuthTransactions rejects consumed or expired verification tokens',
  async ({ prisma, adapters }) => {
    const userId = await insertUser(prisma, 'used@narraza.test');
    await insertToken(prisma, userId, 'verify_email', 'hash-once');
    expect(await adapters.tx.consumeEmailVerification('hash-once')).not.toBeNull();
    expect(await adapters.tx.consumeEmailVerification('hash-once')).toBeNull();
    await insertToken(prisma, userId, 'verify_email', 'hash-expired', -1);
    expect(await adapters.tx.consumeEmailVerification('hash-expired')).toBeNull();
  },
);

authTest(
  'password reset consumes once, sets password, and revokes sessions',
  async ({ prisma, adapters }) => {
    const userId = await insertUser(prisma, 'reset@narraza.test', 'active');
    await adapters.sessions.createSession(userId);
    await adapters.sessions.createSession(userId);
    await insertToken(prisma, userId, 'reset_password', 'hash-reset');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        adapters.tx.consumePasswordReset({
          tokenHash: 'hash-reset',
          newPasswordHash: 'hashed:new',
        }),
      ),
    );
    expect(results.filter((result) => result !== null)).toHaveLength(1);
    const user = await prisma.$queryRawUnsafe<{ password_hash: string }[]>(
      `SELECT password_hash FROM users WHERE id = $1`,
      userId,
    );
    expect(user[0]!.password_hash).toBe('hashed:new');
    const live = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      userId,
    );
    expect(Number(live[0]!.n)).toBe(0);
  },
);

authTest('EmailTokenStore keeps at most maxActive live tokens', async ({ prisma, adapters }) => {
  const userId = await insertUser(prisma, 'cap@narraza.test');
  for (let index = 0; index < 5; index++) {
    await adapters.tokens.issue({
      userId,
      purpose: 'verify_email',
      tokenHash: `cap-${index}`,
      ttlMinutes: 60,
      maxActive: 3,
    });
  }
  const live = await prisma.$queryRawUnsafe<{ token_hash: string }[]>(
    `SELECT token_hash FROM email_action_tokens
      WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL
      ORDER BY created_at`,
    userId,
  );
  expect(live.map((row) => row.token_hash)).toEqual(['cap-2', 'cap-3', 'cap-4']);
});

authTest('RateLimitStore does not lose concurrent increments', async ({ adapters }) => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      adapters.rateLimit.increment({ kind: 'test:conc', key: 'k1', windowSeconds: 3600 }),
    ),
  );
  expect(new Set(results).size).toBe(20);
  expect(Math.max(...results)).toBe(20);
  expect(
    await adapters.rateLimit.count({ kind: 'test:conc', key: 'k1', windowSeconds: 3600 }),
  ).toBe(20);
});

authTest('RateLimitStore markers activate and expire', async ({ adapters }) => {
  await adapters.rateLimit.setMarker({ kind: 'lock', key: 'u1', ttlSeconds: 60 });
  expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u1' })).toBe(true);
  await adapters.rateLimit.setMarker({ kind: 'lock', key: 'u2', ttlSeconds: -1 });
  expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u2' })).toBe(false);
  await adapters.rateLimit.clearMarkers({ kind: 'lock', key: 'u1' });
  expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u1' })).toBe(false);
});

authTest('SessionStore creates, validates, and revokes session', async ({ prisma, adapters }) => {
  const userId = await insertUser(prisma, 'sess@narraza.test', 'active');
  const { sessionToken } = await adapters.sessions.createSession(userId);
  const valid = await adapters.sessions.validateSession(sessionToken);
  expect(valid?.userId).toBe(userId);
  expect(valid?.status).toBe('active');
  await adapters.sessions.revokeSession(sessionToken);
  expect(await adapters.sessions.validateSession(sessionToken)).toBeNull();
});

authTest('SessionStore rejects sessions for non-active users', async ({ prisma, adapters }) => {
  const userId = await insertUser(prisma, 'pending-sess@narraza.test');
  const { sessionToken } = await adapters.sessions.createSession(userId);
  expect(await adapters.sessions.validateSession(sessionToken)).toBeNull();
});
