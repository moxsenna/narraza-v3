import { z } from 'zod';
import { boolFromEnv, intFromEnv, nodeEnvSchema, secretString, type EnvSource } from './common.js';

/**
 * Web process env (S6.3 least-privilege): auth, DB (web role), email, peppers,
 * credit display constant, and the D21 auth policy numbers.
 *
 * MUST NOT contain AI provider keys — enforced by the env-boundary test.
 */
export const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  APP_URL: z.url(),

  AUTH_SECRET: secretString,
  DATABASE_URL_WEB: z.string().min(1),

  // Email (D10, repurposed by D21 for verification + password reset).
  // Production uses Resend; dev/CI uses SMTP to Mailpit. Exactly one must be usable.
  EMAIL_FROM: z.string().min(3),
  RESEND_API_KEY: z.string().min(1).optional(),
  SMTP_URL: z.string().min(1).optional(),

  // Peppers (≠ AUTH_SECRET; S6.3 / D21).
  RATE_LIMIT_PEPPER: secretString,
  EMAIL_TOKEN_PEPPER: secretString,

  // Credit display (D6). Placeholder default; recalibrated in M7.
  MICRO_IDR_PER_CREDIT: intFromEnv(10_000_000),

  // --- D21 auth policy ---
  PASSWORD_MIN_LENGTH: intFromEnv(10),
  ARGON2_MEMORY_KIB: intFromEnv(19_456),
  ARGON2_TIME_COST: intFromEnv(2),
  ARGON2_PARALLELISM: intFromEnv(1),

  EMAIL_VERIFY_TOKEN_TTL_MINUTES: intFromEnv(24 * 60),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: intFromEnv(30),
  EMAIL_TOKEN_RESEND_COOLDOWN_SECONDS: intFromEnv(60),
  EMAIL_TOKEN_MAX_PER_HOUR_IDENTIFIER: intFromEnv(5),
  EMAIL_TOKEN_MAX_PER_HOUR_IP: intFromEnv(20),
  EMAIL_TOKEN_MAX_ACTIVE: intFromEnv(3),

  LOGIN_MAX_FAILS_PER_HOUR_IDENTIFIER: intFromEnv(10),
  LOGIN_LOCKOUT_MINUTES: intFromEnv(15),
  LOGIN_MAX_FAILS_PER_HOUR_IP: intFromEnv(30),
  REGISTER_MAX_PER_HOUR_IP: intFromEnv(10),

  // Session policy (S6.2).
  SESSION_ABSOLUTE_DAYS: intFromEnv(30),
  SESSION_IDLE_DAYS: intFromEnv(14),
  SESSION_ACTIVITY_WRITE_HOURS: intFromEnv(6),

  // Dev-only escape hatch consumed by nothing in production paths.
  DEV_TRUST_PROXY: boolFromEnv,
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: EnvSource = process.env): WebEnv {
  const parsed = webEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid web env:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (!env.RESEND_API_KEY && !env.SMTP_URL) {
    throw new Error('Invalid web env: either RESEND_API_KEY or SMTP_URL must be set');
  }
  return env;
}
