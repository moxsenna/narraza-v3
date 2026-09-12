import type { CreditSummaryView } from '../ports/credit-balance-port.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { computeCreditSummaryView } from './credit-summary.js';

export interface CreditSummaryInput {
  readonly userId: string;
}

export interface CreditSummaryService {
  /** One-snapshot user credit summary; read-only, no balance lock. */
  getSummary(input: CreditSummaryInput): Promise<CreditSummaryView>;
}

export function createCreditSummaryService(unitOfWork: UnitOfWork): CreditSummaryService {
  return {
    getSummary(input: CreditSummaryInput): Promise<CreditSummaryView> {
      return unitOfWork.execute(async (ports) =>
        computeCreditSummaryView(await ports.creditBalance.getBalanceSnapshot(input.userId)),
      );
    },
  };
}
