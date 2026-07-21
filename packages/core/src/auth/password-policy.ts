import { emailLocalPart, normalizeEmail } from './email.js';
import { isCommonPassword } from './common-passwords.js';

/**
 * Password policy (pure, D21): length over complexity per NIST 800-63B — a
 * minimum length, no required symbol/digit classes, but reject passwords equal
 * to the account identifier or present in the common-password deny-list.
 */
export type PasswordViolation = 'too_short' | 'too_long' | 'same_as_email' | 'common_password';

export interface PasswordPolicy {
  minLength: number;
  /** Guards against pathological memory/DoS; argon2 handles any length but there
   * is no reason to accept megabyte passwords. */
  maxLength?: number;
}

export interface PasswordCheckInput {
  password: string;
  email: string;
  policy: PasswordPolicy;
}

const DEFAULT_MAX_LENGTH = 200;

/** Returns every violation (not just the first) so the UI can show them together. */
export function checkPassword(input: PasswordCheckInput): PasswordViolation[] {
  const { password, email, policy } = input;
  const violations: PasswordViolation[] = [];
  const maxLength = policy.maxLength ?? DEFAULT_MAX_LENGTH;

  // Count Unicode code points, not UTF-16 units, so emoji/CJK are not
  // over-counted toward the max or under-counted toward the min.
  const length = [...password].length;

  if (length < policy.minLength) violations.push('too_short');
  if (length > maxLength) violations.push('too_long');

  const lowered = password.toLowerCase();
  if (lowered === normalizeEmail(email) || lowered === emailLocalPart(email)) {
    violations.push('same_as_email');
  }

  if (isCommonPassword(password)) violations.push('common_password');

  return violations;
}

export function isPasswordAcceptable(input: PasswordCheckInput): boolean {
  return checkPassword(input).length === 0;
}
