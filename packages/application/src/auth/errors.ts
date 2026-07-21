/**
 * Auth error codes + their stable public message codes (i18n; final copy in M6).
 * Codes chosen so the client never learns more than it should:
 *  - login never distinguishes unknown-email from wrong-password (INVALID_CREDENTIALS)
 *  - token failures collapse to a single INVALID_TOKEN (expired/used/forged look alike)
 */
export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'WEAK_PASSWORD'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'ACCOUNT_LOCKED';

export interface AuthError {
  code: AuthErrorCode;
  publicMessageCode: string;
  /** Non-secret extra detail safe for the client (e.g. password violations, retry-after). */
  details?: Record<string, unknown>;
}

const MESSAGE_CODES: Record<AuthErrorCode, string> = {
  INVALID_INPUT: 'msg.auth.error.invalid_input',
  WEAK_PASSWORD: 'msg.auth.error.weak_password',
  INVALID_CREDENTIALS: 'msg.auth.error.invalid_credentials',
  EMAIL_NOT_VERIFIED: 'msg.auth.error.email_not_verified',
  INVALID_TOKEN: 'msg.auth.error.invalid_token',
  RATE_LIMITED: 'msg.auth.error.rate_limited',
  ACCOUNT_LOCKED: 'msg.auth.error.account_locked',
};

export function authError(code: AuthErrorCode, details?: Record<string, unknown>): AuthError {
  return details === undefined
    ? { code, publicMessageCode: MESSAGE_CODES[code] }
    : { code, publicMessageCode: MESSAGE_CODES[code], details };
}
