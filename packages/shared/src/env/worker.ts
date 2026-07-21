import { z } from 'zod';
import { boolFromEnv, intFromEnv, nodeEnvSchema, type EnvSource } from './common.js';

/**
 * Generation-worker process env (S6.3): DB (worker role), AI provider keys,
 * job-loop parameters (D12). Hosts the outbox consumer module in Rilis 1 (D11).
 *
 * MUST NOT contain AUTH_SECRET or the web-only peppers — enforced by the
 * env-boundary test.
 */
export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,

  DATABASE_URL_WORKER: z.string().min(1),

  OPENROUTER_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  AI_ENABLE_MOCK: boolFromEnv,

  // Job parameters (D12).
  JOB_LEASE_SECONDS: intFromEnv(60),
  JOB_HEARTBEAT_SECONDS: intFromEnv(20),
  JOB_RECLAIM_SWEEP_SECONDS: intFromEnv(30),
  RETENTION_SWEEP_MINUTES: intFromEnv(60),
  RETENTION_MAX_AGE_HOURS: intFromEnv(24),

  // Outbox consumer module (D11/D12).
  OUTBOX_POLL_MS: intFromEnv(1000),
  OUTBOX_IDLE_BACKOFF_MS: intFromEnv(5000),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid worker env:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  // §1 rule 3: mock AI is forbidden in production.
  if (env.NODE_ENV === 'production' && env.AI_ENABLE_MOCK) {
    throw new Error('Invalid worker env: AI_ENABLE_MOCK=true is forbidden in production');
  }
  if (env.NODE_ENV === 'production' && !env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    throw new Error('Invalid worker env: production requires at least one AI provider key');
  }
  return env;
}
