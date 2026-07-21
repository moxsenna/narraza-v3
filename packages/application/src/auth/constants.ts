/** Auth config + shared constants for the auth use cases (values sourced from
 * webEnv at the composition root — no magic numbers here or in the adapters). */

export type EmailTokenPurpose = 'verify_email' | 'reset_password';

export interface AuthConfig {
  passwordMinLength: number;
  passwordMaxLength: number;

  emailVerifyTokenTtlMinutes: number;
  passwordResetTokenTtlMinutes: number;

  emailTokenResendCooldownSeconds: number;
  emailTokenMaxPerHourIdentifier: number;
  emailTokenMaxPerHourIp: number;
  emailTokenMaxActive: number;

  loginMaxFailsPerHourIdentifier: number;
  loginLockoutMinutes: number;
  loginMaxFailsPerHourIp: number;
  registerMaxPerHourIp: number;

  /** Absolute base URL for building email links (APP_URL). */
  appUrl: string;
}

/** Rate-limit "kind" tags. Purpose is appended for email-token kinds so verify
 * and reset limits are tracked independently (D21). */
export const RL = {
  registerIp: 'register:ip',
  emailTokenIdentifier: (p: EmailTokenPurpose) => `email_token:id:${p}`,
  emailTokenIp: (p: EmailTokenPurpose) => `email_token:ip:${p}`,
  emailTokenCooldown: (p: EmailTokenPurpose) => `email_token:cooldown:${p}`,
  loginFailIdentifier: 'login:fail:id',
  loginFailIp: 'login:fail:ip',
  loginLock: 'login:lock',
} as const;

export const ONE_HOUR_SECONDS = 3600;

/** Verification/reset link paths (UI routes, §2.1). */
export const AUTH_PATHS = {
  verifyConfirm: '/verifikasi/konfirmasi',
  resetConfirm: '/reset-password/konfirmasi',
} as const;

export function buildTokenUrl(appUrl: string, path: string, token: string): string {
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
