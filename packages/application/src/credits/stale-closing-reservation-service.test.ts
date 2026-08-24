import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { createStaleClosingReservationService } from './stale-closing-reservation-service.js';

const candidate = { reservationId: 'reservation', projectId: 'project', jobId: 'job' };
const job = {
  id: 'job',
  projectId: 'project',
  kind: 'scene_generation',
  status: 'failed',
  reservationId: 'reservation',
};
const reservation = {
  id: 'reservation',
  status: 'closing',
  fundingModel: 'user_paid',
  reservedMicroIdr: 1_000n,
  settledMicroIdr: 200n,
  releasedMicroIdr: 0n,
  exposureMicroIdr: 800n,
};

function harness(lockResult: unknown = reservation) {
  const calls: string[] = [];
  const ports = {
    project: {
      lockForUpdate: vi.fn(async () => {
        calls.push('project');
        return { ownerUserId: 'user' };
      }),
    },
    job: {
      lockForReconciliation: vi.fn(async () => {
        calls.push('job');
        return job;
      }),
    },
    creditReservation: {
      findStaleClosingCandidates: vi.fn().mockResolvedValue([candidate]),
      lockStaleClosingBound: vi.fn(async () => {
        calls.push('reservation');
        return lockResult;
      }),
      lockBound: vi.fn().mockResolvedValue(reservation),
      applyReconciliationTarget: vi.fn().mockResolvedValue({ kind: 'reconciled' }),
    },
    workflowInvocation: { countUnresolvedAttempts: vi.fn().mockResolvedValue(1) },
    creditBillingAllocation: {
      findReservationSettlement: vi.fn().mockResolvedValue({
        kind: 'found',
        allocationId: 'allocation',
        userSettlementMicroIdr: 200n,
      }),
    },
    ledger: {
      appendReservationRelease: vi.fn().mockResolvedValue({ kind: 'released' }),
    },
  };
  const unitOfWork = {
    execute: vi.fn(async (operation) => operation(ports)),
  } as unknown as UnitOfWork;
  return { calls, ports, service: createStaleClosingReservationService(unitOfWork) };
}

describe('stale closing reservation service', () => {
  it('locks project then job then stale reservation and final-closes despite unresolved attempt', async () => {
    const { calls, ports, service } = harness();

    await expect(service.sweep()).resolves.toEqual({ discovered: 1, closed: 1 });

    expect(calls).toEqual(['project', 'job', 'reservation']);
    expect(ports.workflowInvocation.countUnresolvedAttempts).not.toHaveBeenCalled();
    expect(ports.ledger.appendReservationRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicroIdr: 800n,
        dedupeKey: 'release:reservation:final-close',
      }),
    );
    expect(ports.creditReservation.applyReconciliationTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        settledTargetMicroIdr: 200n,
        releasedTargetMicroIdr: 800n,
        exposureTargetMicroIdr: 0n,
      }),
    );
  });

  it('does nothing when stale predicate loses race under canonical locks', async () => {
    const { ports, service } = harness(null);

    await expect(service.sweep({ maxAgeHours: 24, batchSize: 10 })).resolves.toEqual({
      discovered: 1,
      closed: 0,
    });
    expect(ports.creditReservation.lockStaleClosingBound).toHaveBeenCalledWith({
      ...candidate,
      maxAgeHours: 24,
    });
    expect(ports.ledger.appendReservationRelease).not.toHaveBeenCalled();
  });
});
