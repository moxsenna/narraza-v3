// @narraza/application — use cases + UnitOfWork + ports (interfaces only).
// Depends on core + shared; never on concrete adapters (db/ai/web). Formal
// UnitOfWork lands in M2; auth use cases + ports (D21) land in M0.

export const APPLICATION_PACKAGE = '@narraza/application' as const;

export { ok, err, type Result } from './result.js';

// Namespace for the auth service + helpers.
export * as auth from './auth/index.js';

// Auth port interfaces + records exported at top level so adapter packages
// (db/web) implement them without reaching through the namespace.
export type {
  AuthPorts,
  AuthUserRecord,
  UserStore,
  EmailTokenStore,
  AuthTransactions,
  RateLimitStore,
  SessionIssuer,
  PasswordHasher,
  TokenService,
  IdentifierHasher,
  Mailer,
} from './auth/ports.js';
export { type AuthConfig, type EmailTokenPurpose } from './auth/constants.js';
export { type AuthError, type AuthErrorCode } from './auth/errors.js';
export {
  createAuthService,
  type AuthService,
  type SessionResult,
  type RequestContext,
} from './auth/service.js';
