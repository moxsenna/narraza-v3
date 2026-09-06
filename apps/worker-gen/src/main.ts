import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  createCreditRetentionService,
  createJobService,
  createOutboxModule,
  createProductionOutboxHandlerRegistry,
  outboxSettingsFromEnv,
} from '@narraza/application';
import { createM4MockProvider, createOpenRouterProvider, createGeminiProvider } from '@narraza/ai';
import { createOutboxDeliveryUnitOfWork, createPrismaClient, createUnitOfWork } from '@narraza/db';
import { loadWorkerEnv } from '@narraza/shared/env/worker';
import pino from 'pino';
import { composeWorker, type ComposedLoop } from './composition.js';
import { createJobLoop, type JobLoopDependencies } from './job-loop.js';
import { createM4JobProcessor } from './m4-job-processor.js';
import { assertRestrictedRoutingServiceable } from './restricted-routing.js';

export { assertRestrictedRoutingServiceable } from './restricted-routing.js';

export function runProductionMain(): ComposedLoop {
  const env = loadWorkerEnv();
  const logger = pino({ name: 'worker-gen' });
  const prisma = createPrismaClient(env.DATABASE_URL_WORKER);
  const unitOfWork = createUnitOfWork(prisma);
  const service = createJobService(unitOfWork);
  const { sweepCreditRetention } = createCreditRetentionService(unitOfWork);
  const providers = new Map();
  if (env.AI_ENABLE_MOCK) providers.set('mock', createM4MockProvider());
  if (env.OPENROUTER_API_KEY) {
    providers.set('openrouter', createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY }));
  }
  if (env.GEMINI_API_KEY) {
    providers.set('gemini', createGeminiProvider({ apiKey: env.GEMINI_API_KEY }));
  }
  assertRestrictedRoutingServiceable({ processorEnabled: env.JOB_PROCESSOR_ENABLED, providers });
  const processor = env.JOB_PROCESSOR_ENABLED
    ? createM4JobProcessor({ unitOfWork, providers })
    : undefined;
  // S6.3: the outbox consumer owns a distinct least-privilege connection. The job
  // lifecycle client and the outbox client are never interchanged.
  const outboxPrisma = createPrismaClient(env.DATABASE_URL_OUTBOX);
  return composeWorker(env, {
    ...(processor ? { processor } : {}),
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
    createOutboxLoop: () =>
      createOutboxModule({
        unitOfWork: createOutboxDeliveryUnitOfWork(outboxPrisma),
        registry: createProductionOutboxHandlerRegistry(),
        settings: outboxSettingsFromEnv(env),
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancelTimer: clearTimeout,
        disconnect: () => outboxPrisma.$disconnect(),
        logger,
      }),
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
