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
export { dbNow, type DbClient } from './db-now.js';
export { createUnitOfWork } from './unit-of-work.js';
export { createTxPorts } from './repos/create-tx-ports.js';
export { createContextBundlePort } from './repos/context-bundle-port.js';
export { createModelPricePort } from './repos/model-price-port.js';
export { createWorkflowPlanPort } from './repos/workflow-plan-port.js';
export { createAttemptRecoveryPort } from './repos/attempt-recovery-port.js';
export { createCreditRetentionPort } from './repos/credit-retention-port.js';
export { createOutboxDeliveryPort } from './repos/outbox-delivery-port.js';
export { createOutboxDeliveryUnitOfWork } from './outbox-delivery-unit-of-work.js';
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
