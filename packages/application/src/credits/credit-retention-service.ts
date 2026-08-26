import type { CreditRetentionSweepResult } from '../ports/credit-retention-port.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';

export const DEFAULT_RETENTION_MAX_AGE_HOURS = 24;
export const DEFAULT_RETENTION_BATCH_SIZE = 100;

export interface CreditRetentionSweepInput {
  readonly maxAgeHours?: number;
  readonly batchSize?: number;
}

export interface CreditRetentionService {
  sweepCreditRetention(input?: CreditRetentionSweepInput): Promise<CreditRetentionSweepResult>;
}

export function createCreditRetentionService(unitOfWork: UnitOfWork): CreditRetentionService {
  return {
    sweepCreditRetention(input = {}): Promise<CreditRetentionSweepResult> {
      const maxAgeHours = input.maxAgeHours ?? DEFAULT_RETENTION_MAX_AGE_HOURS;
      const batchSize = input.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE;
      requirePositiveInteger('maxAgeHours', maxAgeHours);
      requirePositiveInteger('batchSize', batchSize);

      return unitOfWork.execute(
        (ports) => ports.creditRetention.deleteEligible({ maxAgeHours, batchSize }),
        { isolation: 'read_committed' },
      );
    },
  };
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
