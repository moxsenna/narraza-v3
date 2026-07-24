import type { UnitOfWork } from '@narraza/application';
import { Prisma } from './generated/client.js';
import type { PrismaClient } from './client.js';
import { createTxPorts } from './repos/create-tx-ports.js';

const DEFAULT_MAX_RETRIES = 3;

export function createUnitOfWork(prisma: PrismaClient): UnitOfWork {
  return {
    async execute(fn, opts = {}) {
      const isolation =
        opts.isolation === 'serializable'
          ? Prisma.TransactionIsolationLevel.Serializable
          : Prisma.TransactionIsolationLevel.ReadCommitted;
      const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          return await prisma.$transaction(
            async (tx) => fn(createTxPorts(tx)),
            { isolationLevel: isolation },
          );
        } catch (e) {
          if (attempt >= maxRetries || !isRetryableTxError(e)) {
            if (isRetryableTxError(e)) {
              throw retryExhaustedError(e);
            }
            throw e;
          }
          attempt += 1;
          await sleep(jitterMs(attempt));
        }
      }
    },
  };
}

function isRetryableTxError(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    if (code === 'P2034') return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /could not serialize|deadlock detected|40001|40P01/i.test(msg);
}

function jitterMs(attempt: number): number {
  const base = 10 * attempt;
  const jitter = Math.floor(Math.random() * 40);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryExhaustedError(cause: unknown): Error {
  const error = new Error('unitOfWork: retry budget exhausted');
  (error as Error & { code?: string }).code = 'RETRY_EXHAUSTED';
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

export { Prisma };

