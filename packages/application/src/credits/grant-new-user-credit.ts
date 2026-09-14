import type { UnitOfWork } from '../ports/unit-of-work.js';

/**
 * New-user sell-unlock grant (R1). Exactly-once per user, enforced by the
 * ledger dedupe key (not by a read-then-write race): concurrent or repeated
 * calls converge on a single grant row.
 *
 * NEW_USER_GRANT_CREDITS is provisional product policy, not calibrated
 * pricing — M7 owns the final grant size alongside price calibration (D6).
 */
export const NEW_USER_GRANT_CREDITS = 100n;

export interface GrantNewUserCreditInput {
  readonly userId: string;
  readonly ledgerEntryId: string;
  readonly microIdrPerCredit: bigint;
}

export type GrantNewUserCreditResult = 'granted' | 'already_granted';

export function createNewUserGrantService(deps: { unitOfWork: UnitOfWork }) {
  return {
    async ensureGrant(input: GrantNewUserCreditInput): Promise<GrantNewUserCreditResult> {
      const amountMicroIdr = NEW_USER_GRANT_CREDITS * input.microIdrPerCredit;
      if (amountMicroIdr <= 0n) {
        throw new Error('grant-new-user-credit: microIdrPerCredit must be positive');
      }
      const result = await deps.unitOfWork.execute((ports) =>
        ports.ledger.appendGrant({
          userId: input.userId,
          projectId: null,
          ledgerEntryId: input.ledgerEntryId,
          amountMicroIdr,
          dedupeKey: `grant:new-user:${input.userId}`,
        }),
      );
      // binding_invalid means a grant row already exists under this dedupe key
      // with a divergent tuple (only reachable if the formula changed between
      // attempts): the user holds a grant either way, so convergence holds.
      return result.kind === 'granted' ? 'granted' : 'already_granted';
    },
  };
}
