import type { OutboxDeliveryUnitOfWork } from '@narraza/application';
import { Prisma } from './generated/client.js';
import type { PrismaClient } from './client.js';
import { createOutboxDeliveryPort } from './repos/outbox-delivery-port.js';

/**
 * Least-privilege unit of work for the outbox consumer (S6.3/D11).
 *
 * It exposes only `OutboxDeliveryPort`, so consumer code physically cannot
 * reach the ledger, credit or job ports even though in Rilis 1 it runs inside
 * the generation-worker process. The Prisma client passed here is built from
 * `DATABASE_URL_OUTBOX`, never from the worker role URL.
 *
 * Each call is one short READ COMMITTED transaction. Handler execution happens
 * between two calls, never inside one — see `createOutboxDeliveryService`.
 */
export function createOutboxDeliveryUnitOfWork(prisma: PrismaClient): OutboxDeliveryUnitOfWork {
  return {
    execute(fn) {
      return prisma.$transaction(async (tx) => fn(createOutboxDeliveryPort(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    },
  };
}
