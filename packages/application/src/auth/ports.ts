/**
 * Auth ports (M0 W0.4). Application depends only on these interfaces; concrete
 * adapters (Prisma, argon2, HMAC, mailer, Auth.js) live in db/web and are
 * injected at the composition root. The two atomic multi-step operations are
 * isolated in AuthTransactions so their transaction boundary is explicit.
 */
import type { EmailTokenPurpose } from './constants.js';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  status: 'pending_verification' | 'active' | 'suspended' | 'deleted';
  emailVerifiedAt: Date | null;
}

export interface UserStore {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
  /** Insert a pending_verification user. Returns null if the email already
   * exists (unique violation) — callers treat that enumeration-safely. */
  createPendingUser(input: { email: string; passwordHash: string }): Promise<AuthUserRecord | null>;
}

export interface EmailTokenStore {
  /** Insert a token; if the user already holds `maxActive` live tokens for this
   * purpose, revoke the oldest first (cap enforcement, D21). */
  issue(input: {
    userId: string;
    purpose: EmailTokenPurpose;
    tokenHash: string;
    ttlMinutes: number;
    maxActive: number;
  }): Promise<void>;

  revokeAllForUserPurpose(userId: string, purpose: EmailTokenPurpose): Promise<void>;

  /** Resolve a live (unconsumed, unrevoked, unexpired) token to its user, without
   * consuming it. Used by reset-password to validate the new password against the
   * account email before the atomic consume. */
  findActiveTokenUser(input: {
    tokenHash: string;
    purpose: EmailTokenPurpose;
  }): Promise<{ userId: string; email: string } | null>;
}

/**
 * The two race-critical operations (D21). Each is a single DB transaction whose
 * serialization point is a conditional UPDATE on the token row
 * (`consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()`), so a
 * token can be consumed at most once even under concurrent requests.
 */
export interface AuthTransactions {
  /** Consume a verify_email token → mark user active + emailVerified, revoke
   * sibling verify tokens. Returns the userId, or null if the token was
   * invalid/expired/already used. */
  consumeEmailVerification(tokenHash: string): Promise<{ userId: string } | null>;

  /** Consume a reset_password token → set the new password hash, revoke sibling
   * reset tokens, and revoke ALL of the user's sessions. Returns userId or null. */
  consumePasswordReset(input: {
    tokenHash: string;
    newPasswordHash: string;
  }): Promise<{ userId: string } | null>;
}

/** Atomic fixed-window counters + TTL markers (D10/D21). Window boundaries and
 * `now()` are computed by the adapter using the DB clock (no app/DB skew). */
export interface RateLimitStore {
  /** Increment the current window's counter and return the new count. */
  increment(input: { kind: string; key: string; windowSeconds: number }): Promise<number>;
  /** Read the current window's counter without incrementing. */
  count(input: { kind: string; key: string; windowSeconds: number }): Promise<number>;
  /** Upsert a marker that expires after ttlSeconds (cooldown / lockout). */
  setMarker(input: { kind: string; key: string; ttlSeconds: number }): Promise<void>;
  markerActive(input: { kind: string; key: string }): Promise<boolean>;
  clearMarkers(input: { kind: string; key: string }): Promise<void>;
}

export interface SessionIssuer {
  /** Create an Auth.js DB session for the user; returns the raw session token to
   * set as the session cookie. */
  createSession(userId: string): Promise<{ sessionToken: string; expiresAt: Date }>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Constant-time verify of a candidate password against a stored hash. */
  verify(hash: string, password: string): Promise<boolean>;
  /** Verify against an internal dummy hash (same cost params); always false.
   * Called for unknown emails so login timing can't be used to enumerate. */
  dummyVerify(password: string): Promise<boolean>;
}

export interface TokenService {
  /** Cryptographically-random, URL-safe raw token (sent in the email link). */
  generateToken(): string;
  /** Peppered one-way hash of the raw token (only this is stored). */
  hashToken(rawToken: string): string;
}

export interface IdentifierHasher {
  /** Peppered HMAC of an identifier/IP → rate-limit key (raw values never stored). */
  hashIdentifier(value: string): string;
}

export interface Mailer {
  sendVerifyEmail(input: { to: string; url: string }): Promise<void>;
  sendPasswordReset(input: { to: string; url: string }): Promise<void>;
  /** Sent when registration hits an existing account — keeps register responses
   * uniform so they can't be used to enumerate accounts. */
  sendAccountExistsNotice(input: { to: string }): Promise<void>;
}

export interface AuthPorts {
  users: UserStore;
  tokens: EmailTokenStore;
  tx: AuthTransactions;
  rateLimit: RateLimitStore;
  sessions: SessionIssuer;
  passwordHasher: PasswordHasher;
  tokenService: TokenService;
  identifierHasher: IdentifierHasher;
  mailer: Mailer;
}
