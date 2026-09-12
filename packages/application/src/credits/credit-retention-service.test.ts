import { describe, expect, it, vi } from 'vitest';
import type { CreditRetentionPort } from '../ports/credit-retention-port.js';
import type { TxPorts, UnitOfWork, UnitOfWorkOptions } from '../ports/unit-of-work.js';
import {
  createCreditRetentionService,
  DEFAULT_RETENTION_BATCH_SIZE,
  DEFAULT_RETENTION_MAX_AGE_HOURS,
} from './credit-retention-service.js';

function harness() {
  const creditRetention: CreditRetentionPort = {
    deleteEligible: vi.fn().mockResolvedValue({ deletedQuotes: 2, deletedBundles: 3 }),
  };
  const execute = vi.fn(
    async <T>(fn: (ports: TxPorts) => Promise<T>, _options?: UnitOfWorkOptions): Promise<T> =>
      fn({ creditRetention } as TxPorts),
  );
  const unitOfWork: UnitOfWork = { execute };
  return { creditRetention, execute, service: createCreditRetentionService(unitOfWork) };
}

describe('credit retention service', () => {
  it('runs one transaction with default age and batch size', async () => {
    const { creditRetention, execute, service } = harness();

    await expect(service.sweepCreditRetention()).resolves.toEqual({
      deletedQuotes: 2,
      deletedBundles: 3,
    });
    expect(creditRetention.deleteEligible).toHaveBeenCalledWith({
      maxAgeHours: DEFAULT_RETENTION_MAX_AGE_HOURS,
      batchSize: DEFAULT_RETENTION_BATCH_SIZE,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[1]).toEqual({ isolation: 'read_committed' });
  });

  it('passes explicit bounded sweep settings unchanged', async () => {
    const { creditRetention, service } = harness();

    await service.sweepCreditRetention({ maxAgeHours: 48, batchSize: 7 });

    expect(creditRetention.deleteEligible).toHaveBeenCalledWith({
      maxAgeHours: 48,
      batchSize: 7,
    });
  });

  it.each([
    ['maxAgeHours', { maxAgeHours: 0 }],
    ['maxAgeHours', { maxAgeHours: 1.5 }],
    ['batchSize', { batchSize: 0 }],
    ['batchSize', { batchSize: Number.MAX_SAFE_INTEGER + 1 }],
  ] as const)('rejects invalid %s before opening transaction', async (_name, input) => {
    const { execute, service } = harness();

    expect(() => service.sweepCreditRetention(input)).toThrow(RangeError);
    expect(execute).not.toHaveBeenCalled();
  });
});
