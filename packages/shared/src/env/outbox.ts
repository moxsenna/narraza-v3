import { z } from 'zod';
import { intFromEnv, nodeEnvSchema, type EnvSource } from './common.js';

/**
 * Standalone outbox process env (S6.3): DB (outbox role) + channel secrets only.
 * Unused in Rilis 1 deployment (D11: consumer runs inside worker-gen), but kept
 * so splitting the process later is config-only.
 */
export const outboxEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL_OUTBOX: z.string().min(1),
  OUTBOX_POLL_MS: intFromEnv(1000),
  OUTBOX_IDLE_BACKOFF_MS: intFromEnv(5000),
});

export type OutboxEnv = z.infer<typeof outboxEnvSchema>;

export function loadOutboxEnv(source: EnvSource = process.env): OutboxEnv {
  const parsed = outboxEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid outbox env:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
