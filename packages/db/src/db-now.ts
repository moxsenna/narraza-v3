import type { PrismaClient } from './client.js';

/** Subset of the Prisma tx client that supports raw queries. */
export interface DbClient {
  readonly $queryRaw: PrismaClient['$queryRaw'];
  readonly $executeRaw: PrismaClient['$executeRaw'];
}

/**
 * Domain times must come from the Postgres clock (§3.2) so the auth raw SQL
 * comparisons against `now()` cannot drift. Works against the root client or
 * inside a `$transaction` callback (both expose `$queryRaw`).
 */
export async function dbNow(client: DbClient): Promise<Date> {
  const rows = (await client.$queryRaw`SELECT now() AS now`) as Array<{ now: Date | string }>;
  const raw = rows[0]?.now;
  const value = raw instanceof Date ? raw : raw === undefined ? undefined : new Date(raw);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('dbNow: postgres now() did not return a Date');
  }
  return value;
}
