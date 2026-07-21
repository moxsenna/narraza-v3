// @narraza/db — Prisma client, repositories implementing application ports, and
// the Auth.js adapter (D8: web imports DB only through this public API).
// Repos land in M2; M0 exposes the client factory + generated types.

export const DB_PACKAGE = '@narraza/db' as const;

export { createPrismaClient, type PrismaClient } from './client.js';
export {
  createDbAuthAdapters,
  type DbAuthAdapters,
  type SessionConfig,
  type SessionStore,
  type ValidatedSession,
} from './auth/index.js';
export { Prisma } from './generated/client.js';
export type {
  User,
  Session,
  EmailActionToken,
  RateLimitCounter,
  AuditEvent,
  UserStatus,
  UiMode,
  AiTier,
  EmailTokenPurpose,
} from './generated/client.js';
