/**
 * Pure functions computing reservation state machine targets (S_target, L_target, E_target)
 * following Plan §4.3 and §4.4 G.
 *
 * Rules:
 * S_target = min(max(commercialUserCharge, 0), R)
 * E_target = unresolvedRelevantAttempts > 0 ? R - S_target : 0
 * L_target = max(0, R - S_target - E_target)
 * safeRelease = max(0, L_target - L_current)
 * safeSettlement = max(0, S_target - S_current)
 */

export interface TargetComputationInput {
  readonly reservedMicroIdr: bigint;
  readonly commercialUserCharge: bigint;
  readonly unresolvedRelevantAttempts: number;
  readonly currentSettledMicroIdr?: bigint;
  readonly currentReleasedMicroIdr?: bigint;
}

export interface TargetComputationResult {
  readonly settledTargetMicroIdr: bigint;
  readonly releasedTargetMicroIdr: bigint;
  readonly exposureTargetMicroIdr: bigint;
  readonly safeReleaseMicroIdr: bigint;
  readonly safeSettlementMicroIdr: bigint;
}

export type TerminalReservationReason = 'settled' | 'released' | 'cancelled' | 'expired';
export type DerivedReservationStatus = 'open' | 'closing' | 'settled' | 'released' | 'cancelled' | 'expired';

/**
 * Computes target amounts for a credit reservation based on inputs.
 * Strictly enforces R > 0 and monotonic settlement/release constraints.
 */
export function computeReservationTargets(input: TargetComputationInput): TargetComputationResult {
  const R = input.reservedMicroIdr;
  if (R <= 0n) {
    throw new RangeError(`reservedMicroIdr must be strictly positive (R > 0), received ${R}`);
  }

  const S_current = input.currentSettledMicroIdr ?? 0n;
  const L_current = input.currentReleasedMicroIdr ?? 0n;

  // 1. S_target = min(max(commercialUserCharge, 0), R)
  const nonNegativeCharge = input.commercialUserCharge < 0n ? 0n : input.commercialUserCharge;
  const S_target = nonNegativeCharge < R ? nonNegativeCharge : R;

  // 2. E_target = unresolvedRelevantAttempts > 0 ? max(0, R - S_target) : 0
  const remainder = R - S_target;
  const E_target = input.unresolvedRelevantAttempts > 0 && remainder > 0n ? remainder : 0n;

  // 3. L_target = max(0, R - S_target - E_target)
  const remainingForRelease = R - S_target - E_target;
  const L_target = remainingForRelease > 0n ? remainingForRelease : 0n;

  // Monotone check: targets must not be less than current amounts
  if (S_target < S_current) {
    throw new Error(
      `Monotone settlement violation: S_target (${S_target}) < currentSettledMicroIdr (${S_current})`
    );
  }
  if (L_target < L_current) {
    throw new Error(
      `Monotone release violation: L_target (${L_target}) < currentReleasedMicroIdr (${L_current})`
    );
  }

  // 4. Deltas to safely append
  const safeReleaseMicroIdr = L_target - L_current;
  const safeSettlementMicroIdr = S_target - S_current;

  return {
    settledTargetMicroIdr: S_target,
    releasedTargetMicroIdr: L_target,
    exposureTargetMicroIdr: E_target,
    safeReleaseMicroIdr,
    safeSettlementMicroIdr,
  };
}

/**
 * Derives the database-accepted reservation status from computed target tuple.
 * Rule:
 * - if E_target > 0 -> 'closing' (requires exposure > 0 in DB)
 * - if E_target == 0 and S_target > 0 -> 'settled'
 * - if E_target == 0 and S_target == 0 -> terminalReason ?? 'released'
 */
export function deriveReservationStatus(input: {
  settledTargetMicroIdr: bigint;
  releasedTargetMicroIdr: bigint;
  exposureTargetMicroIdr: bigint;
  terminalReason?: 'cancelled' | 'expired' | 'released';
}): DerivedReservationStatus {
  if (input.exposureTargetMicroIdr > 0n) {
    return 'closing';
  }

  if (input.settledTargetMicroIdr > 0n) {
    return 'settled';
  }

  return input.terminalReason ?? 'released';
}
