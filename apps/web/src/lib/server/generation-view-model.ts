import 'server-only';

import {
  microIdrToCreditsFloor,
  type CreditReservationRecord,
  type GenerationJobRecord,
} from '@narraza/application';
import type { TxPorts } from '@narraza/application';
import type { JobPublicView } from '../frontend/job-phase';

function isTerminalStatus(status: GenerationJobRecord['status']): boolean {
  return status !== 'queued' && status !== 'running';
}

function reservationEvidence(
  reservation: CreditReservationRecord | null,
): Pick<JobPublicView, 'zeroCharge' | 'chargedCredits'> {
  if (!reservation) return { zeroCharge: false, chargedCredits: null };
  const finalizable =
    reservation.status === 'released' ||
    reservation.status === 'cancelled' ||
    reservation.status === 'settled';
  if (!finalizable) return { zeroCharge: false, chargedCredits: null };
  if (reservation.settledMicroIdr === 0n) return { zeroCharge: true, chargedCredits: null };
  return {
    zeroCharge: false,
    chargedCredits: Number(microIdrToCreditsFloor(reservation.settledMicroIdr)),
  };
}

/**
 * Maps the authoritative GenerationJobRecord (plus its reservation evidence)
 * into the public view. Never carries job IDs, hashes, request IDs,
 * reservation internals, or micro-IDR values into the client.
 */
export async function toJobPublicView(
  ports: Pick<TxPorts, 'creditReservation'>,
  job: GenerationJobRecord,
): Promise<JobPublicView> {
  let evidence: Pick<JobPublicView, 'zeroCharge' | 'chargedCredits'> = {
    zeroCharge: false,
    chargedCredits: null,
  };
  if (isTerminalStatus(job.status) && job.reservationId !== null) {
    const reservation = await ports.creditReservation.findByJob({
      projectId: job.projectId,
      jobId: job.id,
    });
    evidence = reservationEvidence(reservation);
  }
  return Object.freeze({
    phase: job.status,
    cancelRequested: job.cancelRequestedAt !== null,
    recovered: false,
    ...evidence,
  });
}
