export {
  createAuthService,
  type AuthService,
  type SessionResult,
  type RequestContext,
} from './service.js';
export { authError, type AuthError, type AuthErrorCode } from './errors.js';
export {
  RL,
  AUTH_PATHS,
  ONE_HOUR_SECONDS,
  buildTokenUrl,
  type AuthConfig,
  type EmailTokenPurpose,
} from './constants.js';
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
} from './ports.js';
