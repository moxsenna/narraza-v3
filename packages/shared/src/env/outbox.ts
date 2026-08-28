import { z } from 'zod';
import { intFromEnv, nodeEnvSchema, type EnvSource } from './common.js';

/**
 * Standalone outbox process env (S6.3): DB (outbox role) + channel secrets only.
 * Unused in Rilis 1 deployment (D11: consumer runs inside worker-gen), but kept
 * so splitting the process later is config-only.
 */
export const outboxEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    DATABASE_URL_OUTBOX: z.string().min(1),
    OUTBOX_POLL_MS: intFromEnv(1000),
    OUTBOX_IDLE_BACKOFF_MS: intFromEnv(5000),
    OUTBOX_LEASE_SECONDS: intFromEnv(60),
    OUTBOX_SHUTDOWN_DRAIN_MS: intFromEnv(30000),
  })
  .superRefine((env, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (env.OUTBOX_IDLE_BACKOFF_MS < env.OUTBOX_POLL_MS) {
      issue('OUTBOX_IDLE_BACKOFF_MS', 'idle backoff must be at least the poll interval');
    }
    if (env.OUTBOX_LEASE_SECONDS * 1000 <= env.OUTBOX_POLL_MS) {
      issue('OUTBOX_LEASE_SECONDS', 'lease must outlast one poll interval');
    }
  });

export type OutboxEnv = z.infer<typeof outboxEnvSchema>;

export function loadOutboxEnv(source: EnvSource = process.env): OutboxEnv {
  const parsed = outboxEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid outbox env:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
