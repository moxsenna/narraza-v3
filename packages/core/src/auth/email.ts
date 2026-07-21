/**
 * Email identifier handling (pure). Normalization is the single source of truth
 * for "same identifier" — used for uniqueness, rate-limit keys, and lookups, so
 * it must be deterministic and applied everywhere an email enters the system.
 */

// Deliberately conservative: one @, non-empty local + domain, a dot in domain,
// no whitespace. Real deliverability is proven by the verification email, not by
// a regex — so this only rejects obvious garbage.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercase + trim. Does not touch the local part beyond casing (no dot/plus
 * stripping — those can be significant for some providers). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmailShape(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 254 && EMAIL_SHAPE.test(email);
}

/** Local part before '@', normalized — used by the password policy to reject
 * passwords that echo the account identifier. */
export function emailLocalPart(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  return at === -1 ? normalized : normalized.slice(0, at);
}
