export const MICRO_IDR_PER_CREDIT = 10_000_000n;

/**
 * Floor conversion for book balance / available credits.
 * Truncates fractional remainder toward zero.
 * Rejects negative amounts with RangeError.
 */
export function microIdrToCreditsFloor(amountMicroIdr: bigint): bigint {
  if (amountMicroIdr < 0n) {
    throw new RangeError('Amount in micro-IDR cannot be negative');
  }
  return amountMicroIdr / MICRO_IDR_PER_CREDIT;
}

/**
 * Ceil conversion for held / reconciling / quote credits.
 * Rounds up to next integer credit when fractional remainder exists.
 * Rejects negative amounts with RangeError.
 */
export function microIdrToCreditsCeil(amountMicroIdr: bigint): bigint {
  if (amountMicroIdr < 0n) {
    throw new RangeError('Amount in micro-IDR cannot be negative');
  }
  if (amountMicroIdr === 0n) {
    return 0n;
  }
  return (amountMicroIdr + MICRO_IDR_PER_CREDIT - 1n) / MICRO_IDR_PER_CREDIT;
}
