import type { CreditBalanceSnapshot, CreditSummaryView } from '../ports/credit-balance-port.js';
import { microIdrToCreditsCeil, microIdrToCreditsFloor } from './credit-rounding.js';

/**
 * Pure frozen conversion from a micro-IDR balance snapshot to the canonical
 * credit view (Plan Task 5):
 *
 *   availableMicroIdr = bookMicroIdr − heldMicroIdr − reconcilingMicroIdr
 *   available   = floor(max(availableMicroIdr, 0) / MICRO_IDR_PER_CREDIT)
 *   held        = ceil(heldMicroIdr / MICRO_IDR_PER_CREDIT)
 *   reconciling = ceil(reconcilingMicroIdr / MICRO_IDR_PER_CREDIT)
 *
 * The subtraction is performed in micro-IDR BEFORE floor conversion, so a
 * book/hold pair that would convert to the same credit integers separately
 * still yields the exact sub-credit-correct available. No Number arithmetic,
 * no floats — bigint end to end.
 */
export function computeCreditSummaryView(snapshot: CreditBalanceSnapshot): CreditSummaryView {
  const availableMicroIdr =
    snapshot.bookMicroIdr - snapshot.heldMicroIdr - snapshot.reconcilingMicroIdr;
  const nonNegativeAvailableMicroIdr = availableMicroIdr < 0n ? 0n : availableMicroIdr;
  return {
    available: microIdrToCreditsFloor(nonNegativeAvailableMicroIdr),
    held: microIdrToCreditsCeil(snapshot.heldMicroIdr),
    reconciling: microIdrToCreditsCeil(snapshot.reconcilingMicroIdr),
  };
}
