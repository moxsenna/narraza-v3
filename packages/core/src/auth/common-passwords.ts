/**
 * Small deny-list of the most common/breached passwords (D21: length over
 * complexity, per NIST 800-63B, but block trivially-guessable secrets).
 *
 * This is an M0 seed. It can be swapped for a larger breach corpus later without
 * changing the policy interface. Values are compared after lowercasing.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1234567890',
  '123456789',
  '12345678',
  '111111111',
  '000000000',
  'iloveyou',
  'letmein',
  'welcome',
  'welcome1',
  'admin123',
  'administrator',
  'changeme',
  'secret123',
  'monkey123',
  'dragon123',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'whatever',
  'narraza',
  'narraza123',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
