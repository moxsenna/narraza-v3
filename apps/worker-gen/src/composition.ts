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
  /**
   * D11/S8.4: the outbox consumer is a separate maintenance module inside this process.
   * It must start regardless of JOB_PROCESSOR_ENABLED, like the retention sweeper.
   */
  createOutboxLoop: () => ComposedLoop;
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
  const outboxLoop = deps.createOutboxLoop();
  let shutdownPromise: Promise<void> | undefined;
  const shutdownAll = async (): Promise<void> => {
    const results = await Promise.allSettled([loop.shutdown(), outboxLoop.shutdown()]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  };
  const shutdown = (): void => {
    shutdownPromise ??= shutdownAll().catch((error: unknown) => {
      deps.logger.error({ event: 'worker_shutdown_error', error });
      deps.setExitCode(1);
    });
  };
  deps.registerSignal('SIGTERM', shutdown);
  deps.registerSignal('SIGINT', shutdown);
  deps.logger.info({
    event: 'worker_startup',
    processor_configured: processor !== undefined,
    outbox_consumer: true,
  });
  loop.start();
  outboxLoop.start();
  return { start: () => undefined, shutdown: () => shutdownPromise ?? shutdownAll() };
}
