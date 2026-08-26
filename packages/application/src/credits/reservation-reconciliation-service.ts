import { resolveFundingModel } from './action-funding-policy.js';
import { ReservationReconciliationConflict } from './reservation-reconciliation-error.js';
import { computeReservationTargets } from './reservation-target.js';
import type { TxPorts } from '../ports/unit-of-work.js';
import type { GenerationJobRecord } from '../ports/types.js';

export type ReservationReconciliationResult =
  | {
      readonly kind: 'reconciled';
      readonly status: 'closing' | 'settled' | 'released' | 'cancelled' | 'expired';
    }
  | { readonly kind: 'not_bound' }
  | { readonly kind: 'not_terminal' };

export interface ReservationSettlementEvidence {
  readonly allocationId: string;
  readonly userSettlementMicroIdr: bigint;
}

export async function reconcileTerminalReservation(
  ports: TxPorts,
  input: {
    readonly ownerUserId: string;
    readonly job: GenerationJobRecord;
    readonly terminalReason: 'released' | 'cancelled';
    readonly settlement?: ReservationSettlementEvidence;
    readonly releaseReason?: 'invocation_completed' | 'final-close';
  },
): Promise<ReservationReconciliationResult> {
  const { job } = input;
  if (!['succeeded', 'failed', 'dead', 'cancelled', 'running'].includes(job.status)) {
    return { kind: 'not_terminal' };
  }

  const fundingModel = resolveFundingModel(job.kind);
  if (job.reservationId === null) {
    if (fundingModel === 'pre_d4_legacy') return { kind: 'not_bound' };
    throw new Error('funding_model_violation: terminal job has no reservation');
  }

  const reservation = await ports.creditReservation.lockBound({
    reservationId: job.reservationId,
    projectId: job.projectId,
    jobId: job.id,
  });
  if (reservation === null) throw new Error('terminal reconciliation reservation binding invalid');

  if (fundingModel !== 'pre_d4_legacy' && reservation.fundingModel !== fundingModel) {
    throw new Error('terminal reconciliation funding model conflict');
  }

  if (['settled', 'released', 'cancelled', 'expired'].includes(reservation.status)) {
    return {
      kind: 'reconciled',
      status: reservation.status as 'settled' | 'released' | 'cancelled' | 'expired',
    };
  }

  const effectiveFundingModel =
    fundingModel === 'pre_d4_legacy' ? reservation.fundingModel : fundingModel;
  const allocationPort = ports.creditBillingAllocation;
  let settlement = input.settlement;
  if (settlement === undefined && effectiveFundingModel === 'user_paid') {
    if (allocationPort === undefined) throw new Error('billing allocation capability unavailable');
    const durable = await allocationPort.findReservationSettlement({
      projectId: job.projectId,
      jobId: job.id,
      reservationId: reservation.id,
    });
    if (durable.kind === 'conflict') {
      throw new ReservationReconciliationConflict('allocation_conflict', {
        reservationId: reservation.id,
        jobId: job.id,
        allocationId: null,
      });
    }
    if (durable.kind === 'found') {
      settlement = {
        allocationId: durable.allocationId,
        userSettlementMicroIdr: durable.userSettlementMicroIdr,
      };
    }
  }

  const commercialUserCharge =
    effectiveFundingModel === 'user_paid' ? (settlement?.userSettlementMicroIdr ?? 0n) : 0n;
  const unresolvedRelevantAttempts = await ports.workflowInvocation.countUnresolvedAttempts({
    projectId: job.projectId,
    jobId: job.id,
  });
  const targets = computeReservationTargets({
    reservedMicroIdr: reservation.reservedMicroIdr,
    commercialUserCharge,
    unresolvedRelevantAttempts,
    currentSettledMicroIdr: reservation.settledMicroIdr,
    currentReleasedMicroIdr: reservation.releasedMicroIdr,
  });

  if (effectiveFundingModel === 'user_paid' && targets.safeSettlementMicroIdr > 0n) {
    if (settlement === undefined)
      throw new Error('terminal reconciliation settlement evidence missing');
    const dedupeKey = `settle:${reservation.id}:${settlement.allocationId}` as const;
    const appended = await ports.ledger.appendReservationSettlement({
      projectId: job.projectId,
      jobId: job.id,
      userId: input.ownerUserId,
      reservationId: reservation.id,
      ledgerEntryId: dedupeKey,
      allocationId: settlement.allocationId,
      attemptId: null,
      amountMicroIdr: targets.safeSettlementMicroIdr,
      dedupeKey,
    });
    if (appended.kind !== 'settled' && appended.kind !== 'already_settled') {
      throw new ReservationReconciliationConflict('settlement_conflict', {
        reservationId: reservation.id,
        jobId: job.id,
        allocationId: settlement.allocationId,
      });
    }
  }

  if (effectiveFundingModel === 'user_paid' && targets.safeReleaseMicroIdr > 0n) {
    const releaseReason = input.releaseReason ?? 'final-close';
    if (releaseReason === 'invocation_completed' && settlement === undefined) {
      throw new Error('terminal reconciliation allocation evidence missing');
    }
    const dedupeKey =
      releaseReason === 'invocation_completed'
        ? (`release:${reservation.id}:invocation_completed:${settlement!.allocationId}` as const)
        : (`release:${reservation.id}:final-close` as const);
    const appended = await ports.ledger.appendReservationRelease({
      projectId: job.projectId,
      jobId: job.id,
      userId: input.ownerUserId,
      reservationId: reservation.id,
      ledgerEntryId: dedupeKey,
      reason: releaseReason,
      ...(releaseReason === 'invocation_completed' && {
        allocationId: settlement!.allocationId,
      }),
      attemptId: null,
      amountMicroIdr: targets.safeReleaseMicroIdr,
      dedupeKey,
    });
    if (appended.kind !== 'released' && appended.kind !== 'already_released') {
      throw new ReservationReconciliationConflict('release_conflict', {
        reservationId: reservation.id,
        jobId: job.id,
        allocationId: settlement?.allocationId ?? null,
      });
    }
  }

  const applied = await ports.creditReservation.applyReconciliationTarget({
    reservationId: reservation.id,
    userId: input.ownerUserId,
    projectId: job.projectId,
    jobProjectId: job.projectId,
    jobId: job.id,
    settledTargetMicroIdr: targets.settledTargetMicroIdr,
    releasedTargetMicroIdr: targets.releasedTargetMicroIdr,
    exposureTargetMicroIdr: targets.exposureTargetMicroIdr,
    terminalReason: input.terminalReason,
  });
  if (applied.kind !== 'reconciled' && applied.kind !== 'already_reconciled') {
    throw new ReservationReconciliationConflict('reservation_conflict', {
      reservationId: reservation.id,
      jobId: job.id,
      allocationId: settlement?.allocationId ?? null,
    });
  }

  const status =
    targets.exposureTargetMicroIdr > 0n
      ? 'closing'
      : targets.settledTargetMicroIdr > 0n
        ? 'settled'
        : input.terminalReason;
  return { kind: 'reconciled', status };
}
