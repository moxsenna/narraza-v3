import 'server-only';
import { loadWebEnv } from '@narraza/shared/env/web';
import {
  createPrismaClient,
  createUnitOfWork,
  type PrismaClient,
} from '@narraza/db';
import type { UnitOfWork } from '@narraza/application';

/**
 * Domain composition root. Prisma + UnitOfWork cached on globalThis so Next.js
 * hot reloads don't leak connections. Web never imports @prisma/client (D8).
 */
interface DomainBundle {
  prisma: PrismaClient;
  uow: UnitOfWork;
}

function build(): DomainBundle {
  const env = loadWebEnv();
  const prisma = createPrismaClient(env.DATABASE_URL_WEB);
  const uow = createUnitOfWork(prisma);
  return { prisma, uow };
}

const globalForDomain = globalThis as unknown as { __narrazaDomain?: DomainBundle };

export function getDomain(): DomainBundle {
  return (globalForDomain.__narrazaDomain ??= build());
}

export function getUnitOfWork(): UnitOfWork {
  return getDomain().uow;
}
