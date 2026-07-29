import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createJobService } from '@narraza/application';
import { createPrismaClient, createUnitOfWork } from '@narraza/db';
import { loadWorkerEnv, type WorkerEnv } from '@narraza/shared/env/worker';
import pino from 'pino';
import {
  createJobLoop,
  type JobLoopDependencies,
  type JobLoopSettings,
  type JobProcessor,
} from './job-loop.js';

type LifecycleEnv = Pick<
  WorkerEnv,
  | 'JOB_PROCESSOR_ENABLED'
  | 'JOB_LEASE_SECONDS'
  | 'JOB_HEARTBEAT_SECONDS'
  | 'JOB_RECLAIM_SWEEP_SECONDS'
  | 'JOB_POLL_MS'
  | 'JOB_ERROR_BACKOFF_MS'
  | 'JOB_SHUTDOWN_DRAIN_MS'
>;

export function workerSettingsFromEnv(env: LifecycleEnv): JobLoopSettings {
  return {
    leaseMs: env.JOB_LEASE_SECONDS * 1000,
    heartbeatMs: env.JOB_HEARTBEAT_SECONDS * 1000,
    reclaimSweepMs: env.JOB_RECLAIM_SWEEP_SECONDS * 1000,
    pollMs: env.JOB_POLL_MS,
    errorBackoffMs: env.JOB_ERROR_BACKOFF_MS,
    shutdownDrainMs: env.JOB_SHUTDOWN_DRAIN_MS,
  };
}

interface ComposedLoop {
  start(): void;
  shutdown(): Promise<void>;
}

interface CompositionDependencies {
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

export function runProductionMain(): ComposedLoop {
  const env = loadWorkerEnv();
  const logger = pino({ name: 'worker-gen' });
  const prisma = createPrismaClient(env.DATABASE_URL_WORKER);
  const service = createJobService(createUnitOfWork(prisma));
  return composeWorker(env, {
    createLoop: ({ processor, settings }) =>
      createJobLoop({
        service,
        ...(processor ? { processor } : {}),
        settings,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancelTimer: clearTimeout,
        disconnect: () => prisma.$disconnect(),
        createLeaseToken: randomUUID,
        logger,
      } satisfies JobLoopDependencies),
    registerSignal: (signal, handler) => process.once(signal, handler),
    logger,
    setExitCode: (code) => {
      process.exitCode = code;
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runProductionMain();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
