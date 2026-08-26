import { describe, expect, it } from 'vitest';
import type { CreditBalanceSnapshot } from '../ports/credit-balance-port.js';
import { MICRO_IDR_PER_CREDIT } from './credit-rounding.js';
import { computeCreditSummaryView } from './credit-summary.js';

const M = MICRO_IDR_PER_CREDIT; // 10_000_000n

function snapshot(
  bookMicroIdr: bigint,
  heldMicroIdr: bigint,
  reconcilingMicroIdr: bigint,
): CreditBalanceSnapshot {
  return { bookMicroIdr, heldMicroIdr, reconcilingMicroIdr };
}

describe('computeCreditSummaryView', () => {
  it('returns zero view for an empty snapshot', () => {
    expect(computeCreditSummaryView(snapshot(0n, 0n, 0n))).toEqual({
      available: 0n,
      held: 0n,
      reconciling: 0n,
    });
  });

  it('floors available and ceils held and reconciling', () => {
    // book = 2.5 credits, held = 0.1 credit, reconciling = 0.2 credit
    const view = computeCreditSummaryView(snapshot(M * 2n + 5_000_000n, 1_000_000n, 2_000_000n));
    expect(view.available).toBe(2n); // floor(2.2)
    expect(view.held).toBe(1n); // ceil(0.1)
    expect(view.reconciling).toBe(1n); // ceil(0.2)
  });

  it('subtracts in micro-IDR BEFORE floor conversion (boundary where separate conversion differs)', () => {
    // book = 10,000,001 micro (floor alone = 1 credit), held = 1 micro (ceil alone = 1 credit)
    // Wrong path: floor(book) - ceil(held) = 1 - 1 = 0.
    // Frozen path: floor((10,000,001 - 1) / 10,000,000) = floor(1) = 1.
    const view = computeCreditSummaryView(snapshot(10_000_001n, 1n, 0n));
    expect(view.available).toBe(1n);

    // book = 10,000,001, reconciling = 2: correct floor(9,999,999/M)=0, wrong 1-1=0 matches here,
    // so also assert the exact micro tuple ordering with held only (above) and clamped case (below).
  });

  it('clamps negative availableMicroIdr to zero without touching held/reconciling display', () => {
    // book = 3 credits, held + reconciling = 5 credits -> availableMicro = -2 credits
    const view = computeCreditSummaryView(snapshot(M * 3n, M * 2n, M * 3n));
    expect(view.available).toBe(0n);
    expect(view.held).toBe(2n);
    expect(view.reconciling).toBe(3n);
  });

  it('keeps exact bigint arithmetic on huge values', () => {
    const hugeBook = 9_000_000_000_000_000_000n; // 9e18 micro-IDR, fits BIGINT
    const hugeHeld = 1_000_000_000_000_000_001n;
    const view = computeCreditSummaryView(snapshot(hugeBook, hugeHeld, 0n));
    expect(view.available).toBe((hugeBook - hugeHeld) / M);
    expect(view.held).toBe((hugeHeld + M - 1n) / M);
    expect(view.reconciling).toBe(0n);
    expect(typeof view.available).toBe('bigint');
  });

  it('uses ceil for reconciling with fractional micro remainder', () => {
    const view = computeCreditSummaryView(snapshot(M, 0n, M - 1n));
    expect(view.reconciling).toBe(1n);
    expect(view.available).toBe(0n);
  });
});
