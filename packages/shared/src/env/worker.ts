import { z } from 'zod';
import { boolFromEnv, intFromEnv, nodeEnvSchema, type EnvSource } from './common.js';

/**
 * Generation-worker process env (S6.3): DB (worker role), AI provider keys,
 * job-loop parameters (D12). Hosts the outbox consumer module in Rilis 1 (D11).
 *
 * MUST NOT contain AUTH_SECRET or the web-only peppers — enforced by the
 * env-boundary test.
 */
const strictBoolFromEnv = z
  .enum(['false', '0', 'true', '1'])
  .optional()
  .transform((value) => value === 'true' || value === '1');

export const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,

    DATABASE_URL_WORKER: z.string().min(1),
    // Separate least-privilege role for the embedded outbox consumer (S6.3).
    // The consumer never borrows the generation-worker connection, so the
    // future process split is a PM2 change rather than a code change (D11).
    DATABASE_URL_OUTBOX: z.string().min(1),

    OPENROUTER_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    AI_ENABLE_MOCK: boolFromEnv,
    JOB_PROCESSOR_ENABLED: strictBoolFromEnv,

    // Job parameters (D12).
    JOB_LEASE_SECONDS: intFromEnv(60),
    JOB_HEARTBEAT_SECONDS: intFromEnv(20),
    JOB_RECLAIM_SWEEP_SECONDS: intFromEnv(30),
    JOB_POLL_MS: intFromEnv(1000),
    JOB_ERROR_BACKOFF_MS: intFromEnv(5000),
    JOB_SHUTDOWN_DRAIN_MS: intFromEnv(30000),
    RETENTION_SWEEP_MINUTES: intFromEnv(60),
    RETENTION_MAX_AGE_HOURS: intFromEnv(24),

    // Outbox consumer module (D11/D12). Runs independently of
    // JOB_PROCESSOR_ENABLED, like the retention sweep.
    OUTBOX_POLL_MS: intFromEnv(1000),
    OUTBOX_IDLE_BACKOFF_MS: intFromEnv(5000),
    OUTBOX_LEASE_SECONDS: intFromEnv(60),
    OUTBOX_SHUTDOWN_DRAIN_MS: intFromEnv(30000),
  })
  .superRefine((env, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (env.JOB_HEARTBEAT_SECONDS >= env.JOB_LEASE_SECONDS) {
      issue('JOB_HEARTBEAT_SECONDS', 'heartbeat must be strictly below lease');
    }
    if (env.JOB_ERROR_BACKOFF_MS < env.JOB_POLL_MS) {
      issue('JOB_ERROR_BACKOFF_MS', 'error backoff must be at least poll interval');
    }
    if (env.JOB_SHUTDOWN_DRAIN_MS < env.JOB_HEARTBEAT_SECONDS * 1000) {
      issue('JOB_SHUTDOWN_DRAIN_MS', 'shutdown drain must be at least one heartbeat interval');
    }
    if (env.OUTBOX_IDLE_BACKOFF_MS < env.OUTBOX_POLL_MS) {
      issue('OUTBOX_IDLE_BACKOFF_MS', 'idle backoff must be at least the poll interval');
    }
    if (env.OUTBOX_LEASE_SECONDS * 1000 <= env.OUTBOX_POLL_MS) {
      issue('OUTBOX_LEASE_SECONDS', 'lease must outlast one poll interval');
    }
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
  if (
    env.NODE_ENV === 'production' &&
    env.JOB_PROCESSOR_ENABLED &&
    !env.OPENROUTER_API_KEY &&
    !env.GEMINI_API_KEY
  ) {
    throw new Error('Invalid worker env: production requires at least one AI provider key');
  }
  return env;
}
