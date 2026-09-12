import { describe, expect, it } from 'vitest';
import {
  MICRO_IDR_PER_CREDIT,
  microIdrToCreditsCeil,
  microIdrToCreditsFloor,
} from './credit-rounding.js';

describe('credit-rounding', () => {
  describe('MICRO_IDR_PER_CREDIT constant', () => {
    it('is exactly 10_000_000n', () => {
      expect(MICRO_IDR_PER_CREDIT).toBe(10_000_000n);
    });
  });

  describe('microIdrToCreditsFloor', () => {
    it('converts 0n micro-IDR to 0n credits', () => {
      expect(microIdrToCreditsFloor(0n)).toBe(0n);
    });

    it('converts exact single credit unit (10_000_000n) to 1n credit', () => {
      expect(microIdrToCreditsFloor(10_000_000n)).toBe(1n);
    });

    it('converts exact multiple credit units (100_000_000n) to 10n credits', () => {
      expect(microIdrToCreditsFloor(100_000_000n)).toBe(10n);
    });

    it('truncates fractional remainder (10_000_001n -> 1n)', () => {
      expect(microIdrToCreditsFloor(10_000_001n)).toBe(1n);
    });

    it('truncates remainder just below next unit (19_999_999n -> 1n)', () => {
      expect(microIdrToCreditsFloor(19_999_999n)).toBe(1n);
    });

    it('truncates sub-unit amount (9_999_999n -> 0n)', () => {
      expect(microIdrToCreditsFloor(9_999_999n)).toBe(0n);
    });

    it('handles large bigint values near 64-bit limit correctly', () => {
      const hugeAmount = 9_000_000_000_000_000_000n; // 9e18
      expect(microIdrToCreditsFloor(hugeAmount)).toBe(900_000_000_000n);
    });

    it('throws RangeError on negative amount', () => {
      expect(() => microIdrToCreditsFloor(-1n)).toThrow(RangeError);
      expect(() => microIdrToCreditsFloor(-10_000_000n)).toThrow(RangeError);
    });
  });

  describe('microIdrToCreditsCeil', () => {
    it('converts 0n micro-IDR to 0n credits', () => {
      expect(microIdrToCreditsCeil(0n)).toBe(0n);
    });

    it('converts exact single credit unit (10_000_000n) to 1n credit', () => {
      expect(microIdrToCreditsCeil(10_000_000n)).toBe(1n);
    });

    it('converts exact multiple credit units (100_000_000n) to 10n credits', () => {
      expect(microIdrToCreditsCeil(100_000_000n)).toBe(10n);
    });

    it('rounds up on one-micro remainder (10_000_001n -> 2n)', () => {
      expect(microIdrToCreditsCeil(10_000_001n)).toBe(2n);
    });

    it('rounds up on sub-unit amount (1n -> 1n)', () => {
      expect(microIdrToCreditsCeil(1n)).toBe(1n);
    });

    it('rounds up on sub-unit amount (9_999_999n -> 1n)', () => {
      expect(microIdrToCreditsCeil(9_999_999n)).toBe(1n);
    });

    it('handles large bigint values near 64-bit limit with remainder correctly', () => {
      const hugeWithRem = 9_000_000_000_000_000_001n;
      expect(microIdrToCreditsCeil(hugeWithRem)).toBe(900_000_000_001n);
    });

    it('throws RangeError on negative amount', () => {
      expect(() => microIdrToCreditsCeil(-1n)).toThrow(RangeError);
      expect(() => microIdrToCreditsCeil(-10_000_000n)).toThrow(RangeError);
    });
  });
});
