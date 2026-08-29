// @narraza/worker-outbox — standalone outbox consumer entrypoint. In Rilis 1 the
// outbox consumer runs as a module inside worker-gen (D11); this separate
// entrypoint exists so splitting into its own PM2 process is config-only once an
// external channel arrives. It composes the SAME application module.
import { pathToFileURL } from 'node:url';
import {
  createOutboxModule,
  createProductionOutboxHandlerRegistry,
  outboxSettingsFromEnv,
} from '@narraza/application';
import { createOutboxDeliveryUnitOfWork, createPrismaClient } from '@narraza/db';
import { loadOutboxEnv } from '@narraza/shared/env/outbox';
import pino from 'pino';
import { composeOutboxProcess, type ComposedOutboxProcess } from './composition.js';

export function runProductionMain(): ComposedOutboxProcess {
  const env = loadOutboxEnv();
  const logger = pino({ name: 'worker-outbox' });
  const prisma = createPrismaClient(env.DATABASE_URL_OUTBOX);
  return composeOutboxProcess({
    createOutboxLoop: () =>
      createOutboxModule({
        unitOfWork: createOutboxDeliveryUnitOfWork(prisma),
        registry: createProductionOutboxHandlerRegistry(),
        settings: outboxSettingsFromEnv(env),
        schedule: (callback, ms) => setTimeout(callback, ms),
        cancelTimer: clearTimeout,
        disconnect: () => prisma.$disconnect(),
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
