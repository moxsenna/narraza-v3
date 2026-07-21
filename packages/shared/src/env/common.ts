import { z } from 'zod';

/**
 * Shared primitives for per-process env schemas (§3.1 W0.2).
 *
 * Every operational number lives here as an env field with a default from
 * DECISIONS.md (D12/D21) — no magic numbers in application code (§1 rule 8).
 */

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

/** "true"/"1" → true; anything else (or unset) → false. */
export const boolFromEnv = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

/** Positive integer with a default, tolerant of string input from process.env. */
export const intFromEnv = (def: number) => z.coerce.number().int().positive().default(def);

/** Secrets that must actually be secrets — refuse short values everywhere, not just prod. */
export const secretString = z.string().min(32);

export type EnvSource = Record<string, string | undefined>;
