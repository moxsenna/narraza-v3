import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

/**
 * Prisma 7 requires a driver adapter. Each process passes its own least-privilege
 * connection string (S6.3): web → DATABASE_URL_WEB, worker → DATABASE_URL_WORKER.
 * Web reaches this only through @narraza/db's public API (D8 / web-boundary).
 */
export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
