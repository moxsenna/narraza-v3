import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../client.js';
import { createDbAuthAdapters } from './index.js';

/**
 * Integration tests against real Postgres (the raw SQL can't be trusted without
 * it). Point TEST_DATABASE_URL at a migrated DB; the suite skips if unset so a
 * DB-less unit run doesn't fail. M0 uses the dev DB with truncation between
 * tests; per-file schema isolation is an M1 harness concern.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const prisma = createPrismaClient(url ?? 'postgresql://invalid');
const adapters = createDbAuthAdapters(prisma, {
  idleDays: 14,
  absoluteDays: 30,
  activityWriteHours: 6,
});

async function truncate() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, sessions, email_action_tokens, rate_limit_counters RESTART IDENTITY CASCADE',
  );
}

async function insertUser(email: string, status = 'pending_verification'): Promise<string> {
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

suite('AuthTransactions (atomic consume)', () => {
  beforeEach(truncate);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('consumes a verification token exactly once under concurrency', async () => {
    const userId = await insertUser('race@narraza.test');
    await insertToken(userId, 'verify_email', 'hash-verify-race');

    // Fire many concurrent consumers of the SAME token.
    const results = await Promise.all(
      Array.from({ length: 12 }, () => adapters.tx.consumeEmailVerification('hash-verify-race')),
    );

    const winners = results.filter((r) => r !== null);
    expect(winners).toHaveLength(1); // exactly one succeeds
    expect(winners[0]!.userId).toBe(userId);

    const user = await prisma.$queryRawUnsafe<{ status: string; email_verified_at: Date | null }[]>(
      `SELECT status, email_verified_at FROM users WHERE id = $1`,
      userId,
    );
    expect(user[0]!.status).toBe('active');
    expect(user[0]!.email_verified_at).not.toBeNull();
  });

  it('rejects an already-consumed or expired verification token', async () => {
    const userId = await insertUser('used@narraza.test');
    await insertToken(userId, 'verify_email', 'hash-once');
    expect(await adapters.tx.consumeEmailVerification('hash-once')).not.toBeNull();
    expect(await adapters.tx.consumeEmailVerification('hash-once')).toBeNull();

    await insertToken(userId, 'verify_email', 'hash-expired', -1); // already expired
    expect(await adapters.tx.consumeEmailVerification('hash-expired')).toBeNull();
  });

  it('password reset consumes once, sets password, and revokes all sessions', async () => {
    const userId = await insertUser('reset@narraza.test', 'active');
    await adapters.sessions.createSession(userId);
    await adapters.sessions.createSession(userId);
    await insertToken(userId, 'reset_password', 'hash-reset');

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        adapters.tx.consumePasswordReset({
          tokenHash: 'hash-reset',
          newPasswordHash: 'hashed:new',
        }),
      ),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);

    const user = await prisma.$queryRawUnsafe<{ password_hash: string }[]>(
      `SELECT password_hash FROM users WHERE id = $1`,
      userId,
    );
    expect(user[0]!.password_hash).toBe('hashed:new');

    // every session revoked → none validate
    const live = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      userId,
    );
    expect(Number(live[0]!.n)).toBe(0);
  });
});

suite('EmailTokenStore cap', () => {
  beforeEach(truncate);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps at most maxActive live tokens, revoking the oldest', async () => {
    const userId = await insertUser('cap@narraza.test');
    for (let i = 0; i < 5; i++) {
      await adapters.tokens.issue({
        userId,
        purpose: 'verify_email',
        tokenHash: `cap-${i}`,
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
    expect(live).toHaveLength(3);
    // the three newest survive; oldest two revoked
    expect(live.map((r) => r.token_hash)).toEqual(['cap-2', 'cap-3', 'cap-4']);
  });
});

suite('RateLimitStore', () => {
  beforeEach(truncate);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not lose counts under concurrent increments', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        adapters.rateLimit.increment({ kind: 'test:conc', key: 'k1', windowSeconds: 3600 }),
      ),
    );
    // returned counts are all distinct 1..20; final count is exactly 20
    expect(new Set(results).size).toBe(20);
    expect(Math.max(...results)).toBe(20);
    expect(
      await adapters.rateLimit.count({ kind: 'test:conc', key: 'k1', windowSeconds: 3600 }),
    ).toBe(20);
  });

  it('markers activate and expire', async () => {
    await adapters.rateLimit.setMarker({ kind: 'lock', key: 'u1', ttlSeconds: 60 });
    expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u1' })).toBe(true);

    await adapters.rateLimit.setMarker({ kind: 'lock', key: 'u2', ttlSeconds: -1 }); // already expired
    expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u2' })).toBe(false);

    await adapters.rateLimit.clearMarkers({ kind: 'lock', key: 'u1' });
    expect(await adapters.rateLimit.markerActive({ kind: 'lock', key: 'u1' })).toBe(false);
  });
});

suite('SessionStore', () => {
  beforeEach(truncate);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and validates a session; revoke invalidates it', async () => {
    const userId = await insertUser('sess@narraza.test', 'active');
    const { sessionToken } = await adapters.sessions.createSession(userId);

    const valid = await adapters.sessions.validateSession(sessionToken);
    expect(valid?.userId).toBe(userId);
    expect(valid?.status).toBe('active');

    await adapters.sessions.revokeSession(sessionToken);
    expect(await adapters.sessions.validateSession(sessionToken)).toBeNull();
  });

  it('does not validate sessions for non-active users', async () => {
    const userId = await insertUser('pending-sess@narraza.test'); // pending_verification
    const { sessionToken } = await adapters.sessions.createSession(userId);
    expect(await adapters.sessions.validateSession(sessionToken)).toBeNull();
  });
});
