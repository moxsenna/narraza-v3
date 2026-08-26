import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createCreditRetentionService, createJobService } from '@narraza/application';
import { createPrismaClient, createUnitOfWork } from '@narraza/db';
import { loadWorkerEnv } from '@narraza/shared/env/worker';
import pino from 'pino';
import { composeWorker, type ComposedLoop } from './composition.js';
import { createJobLoop, type JobLoopDependencies } from './job-loop.js';

export function runProductionMain(): ComposedLoop {
  const env = loadWorkerEnv();
  const logger = pino({ name: 'worker-gen' });
  const prisma = createPrismaClient(env.DATABASE_URL_WORKER);
  const unitOfWork = createUnitOfWork(prisma);
  const service = createJobService(unitOfWork);
  const { sweepCreditRetention } = createCreditRetentionService(unitOfWork);
  return composeWorker(env, {
    createLoop: ({ processor, settings }) =>
      createJobLoop({
        service,
        sweepCreditRetention,
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
