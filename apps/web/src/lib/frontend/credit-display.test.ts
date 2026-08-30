import { describe, expect, test } from 'vitest';
import { LOW_BALANCE_CREDIT_THRESHOLD, creditSummaryDisplay } from './credit-display';

describe('credit display mapping (D6)', () => {
  test('keeps already-converted credit values and derives the low-balance state', () => {
    const view = creditSummaryDisplay(9, 3, 3);
    expect(view).toEqual({
      availableCredits: 9,
      heldCredits: 3,
      reconcilingCredits: 3,
      lowBalance: true,
    });
  });

  test('keeps zero balances stable and inside the low-balance state', () => {
    expect(creditSummaryDisplay(0, 0, 0)).toEqual({
      availableCredits: 0,
      heldCredits: 0,
      reconcilingCredits: 0,
      lowBalance: true,
    });
  });

  test('marks balances at or above the threshold as normal', () => {
    const view = creditSummaryDisplay(LOW_BALANCE_CREDIT_THRESHOLD, 0, 0);
    expect(view.lowBalance).toBe(false);
    expect(view.availableCredits).toBe(LOW_BALANCE_CREDIT_THRESHOLD);
  });
});
