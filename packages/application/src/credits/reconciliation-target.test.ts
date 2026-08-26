/**
 * Task 8 application-level tests for absolute reservation targets.
 * Reuses production contracts: computeReservationTargets, deriveReservationStatus
 */

import { describe, it, expect } from 'vitest';
import { computeReservationTargets, deriveReservationStatus } from './reservation-target.js';

describe('Task 8 Application Contracts', () => {
  const R = 1000000n; // 1 M IDR reserved

  describe('computeReservationTargets', () => {
    it('computes S_target correctly with commercialUserCharge < R', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: R,
        commercialUserCharge: 600000n,
        unresolvedRelevantAttempts: 0,
      });

      expect(result.settledTargetMicroIdr).toBe(600000n);
      expect(result.releasedTargetMicroIdr).toBe(400000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeSettlementMicroIdr).toBe(600000n); // current=0
      expect(result.safeReleaseMicroIdr).toBe(400000n); // current=0
    });

    it('handles resolution with exposure when unresolved attempts exist', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: R,
        commercialUserCharge: 600000n,
        unresolvedRelevantAttempts: 2,
      });

      expect(result.settledTargetMicroIdr).toBe(600000n);
      expect(result.releasedTargetMicroIdr).toBe(0n);
      expect(result.exposureTargetMicroIdr).toBe(400000n); // remainder
    });

    it('enforces monotonicity on settled: rejects proposed < current', () => {
      const current = 700000n;
      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: R,
          commercialUserCharge: 600000n,
          unresolvedRelevantAttempts: 0,
          currentSettledMicroIdr: current,
        }),
      ).toThrow(/Monotone settlement violation/);
    });

    it('enforces monotonicity on released: rejects proposed < current', () => {
      const current = 800000n; // Very high existing release
      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: R,
          commercialUserCharge: 300000n,
          unresolvedRelevantAttempts: 0,
          currentReleasedMicroIdr: current,
        }),
      ).toThrow(/Monotone release violation/);
    });

    it('conservation law: S + L + E always equals R', () => {
      const cases = [
        { charge: 0n, attempts: 0 },
        { charge: R / 2n, attempts: 0 },
        { charge: R, attempts: 0 },
        { charge: 0n, attempts: 5 },
        { charge: R / 3n, attempts: 3 },
      ];

      for (const { charge, attempts } of cases) {
        const result = computeReservationTargets({
          reservedMicroIdr: R,
          commercialUserCharge: charge,
          unresolvedRelevantAttempts: attempts,
        });

        const sum =
          result.settledTargetMicroIdr +
          result.releasedTargetMicroIdr +
          result.exposureTargetMicroIdr;
        expect(sum).toBe(R);
      }
    });

    it('R must be strictly positive', () => {
      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: 0n,
          commercialUserCharge: 0n,
          unresolvedRelevantAttempts: 0,
        }),
      ).toThrow(/reservedMicroIdr must be strictly positive/);

      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: -100n,
          commercialUserCharge: 0n,
          unresolvedRelevantAttempts: 0,
        }),
      ).toThrow(/reservedMicroIdr must be strictly positive/);
    });
  });

  describe('deriveReservationStatus', () => {
    it('E > 0 derives closing status', () => {
      const status = deriveReservationStatus({
        settledTargetMicroIdr: 600000n,
        releasedTargetMicroIdr: 0n,
        exposureTargetMicroIdr: 400000n,
      });
      expect(status).toBe('closing');
    });

    it('E = 0 and S > 0 derives settled status', () => {
      const status = deriveReservationStatus({
        settledTargetMicroIdr: 1000000n,
        releasedTargetMicroIdr: 0n,
        exposureTargetMicroIdr: 0n,
      });
      expect(status).toBe('settled');
    });

    it('E = 0, S = 0, L = R derives terminal reason or released', () => {
      const statusWithReason = deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 1000000n,
        exposureTargetMicroIdr: 0n,
        terminalReason: 'cancelled',
      });
      expect(statusWithReason).toBe('cancelled');

      const statusDefault = deriveReservationStatus({
        settledTargetMicroIdr: 0n,
        releasedTargetMicroIdr: 1000000n,
        exposureTargetMicroIdr: 0n,
      });
      expect(statusDefault).toBe('released');
    });

    // NOTE: 'open' detection requires reservedMicroIdr which deriveReservationStatus doesn't receive
    // Open state must be checked at caller layer comparing E_target == R from computeReservationTargets result
  });
});
