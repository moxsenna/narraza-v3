import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IdentifierHasher, TokenService } from '@narraza/application';

/**
 * Token service (D21): the raw token is 256 bits of randomness sent in the email
 * link; only its peppered HMAC-SHA256 is stored, so a DB leak doesn't expose
 * usable tokens. Uses EMAIL_TOKEN_PEPPER.
 */
export function createTokenService(pepper: string): TokenService {
  return {
    generateToken() {
      return randomBytes(32).toString('base64url');
    },
    hashToken(rawToken) {
      return createHmac('sha256', pepper).update(rawToken).digest('hex');
    },
  };
}

/**
 * Identifier hasher for rate-limit keys: peppered HMAC of email/IP so raw
 * identifiers never land in rate_limit_counters. Uses RATE_LIMIT_PEPPER.
 */
export function createIdentifierHasher(pepper: string): IdentifierHasher {
  return {
    hashIdentifier(value) {
      return createHmac('sha256', pepper).update(value.toLowerCase()).digest('hex');
    },
  };
}

/** Constant-time string compare (for opaque token/cookie comparisons if needed). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
