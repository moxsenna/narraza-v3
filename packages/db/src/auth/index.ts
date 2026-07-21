import type { PrismaClient } from '../client.js';
import { createUserStore } from './user-store.js';
import { createEmailTokenStore } from './token-store.js';
import { createRateLimitStore } from './rate-limit-store.js';
import { createAuthTransactions } from './transactions.js';
import { createSessionStore, type SessionConfig } from './session-store.js';

/**
 * DB-side auth adapters (the port implementations that touch Postgres). The
 * non-DB adapters (password hasher, token/identifier HMAC, mailer) are wired in
 * the web composition root. Returns the SessionStore separately because web also
 * needs its validate/revoke methods (not just the SessionIssuer port).
 */
export function createDbAuthAdapters(prisma: PrismaClient, sessionConfig: SessionConfig) {
  const sessions = createSessionStore(prisma, sessionConfig);
  return {
    users: createUserStore(prisma),
    tokens: createEmailTokenStore(prisma),
    rateLimit: createRateLimitStore(prisma),
    tx: createAuthTransactions(prisma),
    sessions,
  };
}

export type DbAuthAdapters = ReturnType<typeof createDbAuthAdapters>;
export { type SessionConfig, type SessionStore, type ValidatedSession } from './session-store.js';
