import type { WorkerEnv } from '@narraza/shared/env/worker';
import type { JobLoopSettings, JobProcessor } from './job-loop.js';

type LifecycleEnv = Pick<
  WorkerEnv,
  | 'JOB_PROCESSOR_ENABLED'
  | 'JOB_LEASE_SECONDS'
  | 'JOB_HEARTBEAT_SECONDS'
  | 'JOB_RECLAIM_SWEEP_SECONDS'
  | 'JOB_POLL_MS'
  | 'JOB_ERROR_BACKOFF_MS'
  | 'JOB_SHUTDOWN_DRAIN_MS'
  | 'RETENTION_SWEEP_MINUTES'
  | 'RETENTION_MAX_AGE_HOURS'
>;

export function workerSettingsFromEnv(env: LifecycleEnv): JobLoopSettings {
  return {
    leaseMs: env.JOB_LEASE_SECONDS * 1000,
    heartbeatMs: env.JOB_HEARTBEAT_SECONDS * 1000,
    reclaimSweepMs: env.JOB_RECLAIM_SWEEP_SECONDS * 1000,
    pollMs: env.JOB_POLL_MS,
    errorBackoffMs: env.JOB_ERROR_BACKOFF_MS,
    shutdownDrainMs: env.JOB_SHUTDOWN_DRAIN_MS,
    retentionSweepMs: env.RETENTION_SWEEP_MINUTES * 60_000,
    retentionMaxAgeHours: env.RETENTION_MAX_AGE_HOURS,
  };
}

export interface ComposedLoop {
  start(): void;
  shutdown(): Promise<void>;
}

export interface CompositionDependencies {
  processor?: JobProcessor;
  createLoop: (input: { processor?: JobProcessor; settings: JobLoopSettings }) => ComposedLoop;
  registerSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  logger: { info: (value: object) => void; error: (value: object) => void };
  setExitCode: (code: number) => void;
}

export function composeWorker(env: LifecycleEnv, deps: CompositionDependencies): ComposedLoop {
  if (env.JOB_PROCESSOR_ENABLED && !deps.processor) {
    throw new Error('JOB_PROCESSOR_ENABLED=true requires a configured processor');
  }
  const processor = env.JOB_PROCESSOR_ENABLED ? deps.processor : undefined;
  const loop = deps.createLoop({
    ...(processor ? { processor } : {}),
    settings: workerSettingsFromEnv(env),
  });
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): void => {
    shutdownPromise ??= loop.shutdown().catch((error: unknown) => {
      deps.logger.error({ event: 'worker_shutdown_error', error });
      deps.setExitCode(1);
    });
  };
  deps.registerSignal('SIGTERM', shutdown);
  deps.registerSignal('SIGINT', shutdown);
  deps.logger.info({ event: 'worker_startup', processor_configured: processor !== undefined });
  loop.start();
  return loop;
}
