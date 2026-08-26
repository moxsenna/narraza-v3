import { describe, expect, it } from 'vitest';
import {
  computeReservationTargets,
  deriveReservationStatus,
  type TargetComputationInput,
} from './reservation-target.js';

describe('reservation-target', () => {
  describe('computeReservationTargets', () => {
    it('throws on reservedMicroIdr <= 0 (invariant R > 0)', () => {
      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: 0n,
          commercialUserCharge: 10_000_000n,
          unresolvedRelevantAttempts: 0,
          currentSettledMicroIdr: 0n,
          currentReleasedMicroIdr: 0n,
        }),
      ).toThrowError(/reservedMicroIdr must be strictly positive/);

      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: -10_000_000n,
          commercialUserCharge: 0n,
          unresolvedRelevantAttempts: 0,
          currentSettledMicroIdr: 0n,
          currentReleasedMicroIdr: 0n,
        }),
      ).toThrowError(/reservedMicroIdr must be strictly positive/);
    });

    it('computes exact targets for terminal usable output with no unresolved attempts', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 30_000_000n,
        unresolvedRelevantAttempts: 0,
        currentSettledMicroIdr: 0n,
        currentReleasedMicroIdr: 0n,
      });

      expect(result.settledTargetMicroIdr).toBe(30_000_000n);
      expect(result.releasedTargetMicroIdr).toBe(20_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(20_000_000n);
      expect(result.safeSettlementMicroIdr).toBe(30_000_000n);
      expect(
        result.settledTargetMicroIdr +
          result.releasedTargetMicroIdr +
          result.exposureTargetMicroIdr,
      ).toBe(50_000_000n);
    });

    it('computes exact targets for terminal zero output with no unresolved attempts (full release)', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 0n,
        unresolvedRelevantAttempts: 0,
        currentSettledMicroIdr: 0n,
        currentReleasedMicroIdr: 0n,
      });

      expect(result.settledTargetMicroIdr).toBe(0n);
      expect(result.releasedTargetMicroIdr).toBe(50_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(50_000_000n);
      expect(result.safeSettlementMicroIdr).toBe(0n);
      expect(
        result.settledTargetMicroIdr +
          result.releasedTargetMicroIdr +
          result.exposureTargetMicroIdr,
      ).toBe(50_000_000n);
    });

    it('caps user settlement at reservation amount (overage policy)', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 80_000_000n, // exceeds R
        unresolvedRelevantAttempts: 0,
        currentSettledMicroIdr: 0n,
        currentReleasedMicroIdr: 0n,
      });

      expect(result.settledTargetMicroIdr).toBe(50_000_000n);
      expect(result.releasedTargetMicroIdr).toBe(0n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(0n);
      expect(result.safeSettlementMicroIdr).toBe(50_000_000n);
    });

    it('holds remainder in exposure when unresolved attempts remain and charge < R', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 20_000_000n,
        unresolvedRelevantAttempts: 1,
        currentSettledMicroIdr: 0n,
        currentReleasedMicroIdr: 0n,
      });

      expect(result.settledTargetMicroIdr).toBe(20_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(30_000_000n);
      expect(result.releasedTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(0n);
      expect(result.safeSettlementMicroIdr).toBe(20_000_000n);
    });

    it('computes E_target = 0 when settlement reaches cap R even with unresolved attempts', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 50_000_000n,
        unresolvedRelevantAttempts: 2,
        currentSettledMicroIdr: 0n,
        currentReleasedMicroIdr: 0n,
      });

      expect(result.settledTargetMicroIdr).toBe(50_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.releasedTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(0n);
      expect(result.safeSettlementMicroIdr).toBe(50_000_000n);
    });

    it('calculates safeRelease delta incrementally when current released is non-zero (late reconciliation)', () => {
      // Step 1: previously released 10m
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 20_000_000n,
        unresolvedRelevantAttempts: 0,
        currentSettledMicroIdr: 20_000_000n,
        currentReleasedMicroIdr: 10_000_000n,
      });

      expect(result.settledTargetMicroIdr).toBe(20_000_000n);
      expect(result.releasedTargetMicroIdr).toBe(30_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(20_000_000n); // 30m target - 10m current = 20m delta
      expect(result.safeSettlementMicroIdr).toBe(0n); // 20m target - 20m current = 0m delta
    });

    it('handles idempotent replay (no delta when current matches target)', () => {
      const result = computeReservationTargets({
        reservedMicroIdr: 50_000_000n,
        commercialUserCharge: 30_000_000n,
        unresolvedRelevantAttempts: 0,
        currentSettledMicroIdr: 30_000_000n,
        currentReleasedMicroIdr: 20_000_000n,
      });

      expect(result.settledTargetMicroIdr).toBe(30_000_000n);
      expect(result.releasedTargetMicroIdr).toBe(20_000_000n);
      expect(result.exposureTargetMicroIdr).toBe(0n);
      expect(result.safeReleaseMicroIdr).toBe(0n);
      expect(result.safeSettlementMicroIdr).toBe(0n);
    });

    it('enforces S + L + E = R invariant across a property table of test cases', () => {
      const testCases: TargetComputationInput[] = [
        { reservedMicroIdr: 100n, commercialUserCharge: 0n, unresolvedRelevantAttempts: 0 },
        { reservedMicroIdr: 100n, commercialUserCharge: 0n, unresolvedRelevantAttempts: 3 },
        { reservedMicroIdr: 100n, commercialUserCharge: 40n, unresolvedRelevantAttempts: 0 },
        { reservedMicroIdr: 100n, commercialUserCharge: 40n, unresolvedRelevantAttempts: 1 },
        { reservedMicroIdr: 100n, commercialUserCharge: 100n, unresolvedRelevantAttempts: 0 },
        { reservedMicroIdr: 100n, commercialUserCharge: 100n, unresolvedRelevantAttempts: 2 },
        { reservedMicroIdr: 100n, commercialUserCharge: 150n, unresolvedRelevantAttempts: 0 },
        { reservedMicroIdr: 100n, commercialUserCharge: 150n, unresolvedRelevantAttempts: 1 },
        {
          reservedMicroIdr: 10_000_000n,
          commercialUserCharge: -50n,
          unresolvedRelevantAttempts: 0,
        },
      ];

      for (const tc of testCases) {
        const res = computeReservationTargets(tc);
        expect(
          res.settledTargetMicroIdr + res.releasedTargetMicroIdr + res.exposureTargetMicroIdr,
        ).toBe(tc.reservedMicroIdr);
        expect(res.settledTargetMicroIdr).toBeGreaterThanOrEqual(0n);
        expect(res.releasedTargetMicroIdr).toBeGreaterThanOrEqual(0n);
        expect(res.exposureTargetMicroIdr).toBeGreaterThanOrEqual(0n);
        expect(res.safeReleaseMicroIdr).toBeGreaterThanOrEqual(0n);
        expect(res.safeSettlementMicroIdr).toBeGreaterThanOrEqual(0n);
      }
    });

    it('rejects decreasing settlement or release (monotone guarantee)', () => {
      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: 50_000_000n,
          commercialUserCharge: 10_000_000n,
          unresolvedRelevantAttempts: 0,
          currentSettledMicroIdr: 20_000_000n, // higher than target 10m
          currentReleasedMicroIdr: 0n,
        }),
      ).toThrowError(/Monotone settlement violation/);

      expect(() =>
        computeReservationTargets({
          reservedMicroIdr: 50_000_000n,
          commercialUserCharge: 50_000_000n,
          unresolvedRelevantAttempts: 0,
          currentSettledMicroIdr: 0n,
          currentReleasedMicroIdr: 20_000_000n, // higher than target 0m
        }),
      ).toThrowError(/Monotone release violation/);
    });
  });

  describe('deriveReservationStatus', () => {
    it('derives closing when exposureTarget > 0', () => {
      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 20_000_000n,
          releasedTargetMicroIdr: 0n,
          exposureTargetMicroIdr: 30_000_000n,
        }),
      ).toBe('closing');

      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 0n,
          releasedTargetMicroIdr: 0n,
          exposureTargetMicroIdr: 50_000_000n,
        }),
      ).toBe('closing');
    });

    it('derives settled when exposureTarget == 0 and settledTarget > 0', () => {
      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 30_000_000n,
          releasedTargetMicroIdr: 20_000_000n,
          exposureTargetMicroIdr: 0n,
        }),
      ).toBe('settled');

      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 50_000_000n,
          releasedTargetMicroIdr: 0n,
          exposureTargetMicroIdr: 0n,
        }),
      ).toBe('settled');
    });

    it('derives released when exposureTarget == 0 and settledTarget == 0 by default', () => {
      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 0n,
          releasedTargetMicroIdr: 50_000_000n,
          exposureTargetMicroIdr: 0n,
        }),
      ).toBe('released');
    });

    it('respects terminal override for cancelled or expired when settledTarget == 0 and exposureTarget == 0', () => {
      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 0n,
          releasedTargetMicroIdr: 50_000_000n,
          exposureTargetMicroIdr: 0n,
          terminalReason: 'cancelled',
        }),
      ).toBe('cancelled');

      expect(
        deriveReservationStatus({
          settledTargetMicroIdr: 0n,
          releasedTargetMicroIdr: 50_000_000n,
          exposureTargetMicroIdr: 0n,
          terminalReason: 'expired',
        }),
      ).toBe('expired');
    });

    it('does not allow closing status when exposureTarget == 0 (DB check compliance)', () => {
      const status = deriveReservationStatus({
        settledTargetMicroIdr: 50_000_000n,
        releasedTargetMicroIdr: 0n,
        exposureTargetMicroIdr: 0n,
      });
      expect(status).not.toBe('closing');
      expect(status).toBe('settled');
    });
  });
});
