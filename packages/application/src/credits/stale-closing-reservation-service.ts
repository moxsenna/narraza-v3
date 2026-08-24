import { reconcileTerminalReservation } from './reservation-reconciliation-service.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';

export interface SweepStaleClosingReservationsInput {
  readonly maxAgeHours?: number;
  readonly batchSize?: number;
}

export interface SweepStaleClosingReservationsResult {
  readonly discovered: number;
  readonly closed: number;
}

export interface StaleClosingReservationService {
  sweep(input?: SweepStaleClosingReservationsInput): Promise<SweepStaleClosingReservationsResult>;
}

const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_BATCH_SIZE = 25;

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

export function createStaleClosingReservationService(
  unitOfWork: UnitOfWork,
): StaleClosingReservationService {
  return {
    async sweep(input = {}) {
      const maxAgeHours = input.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
      const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
      requirePositiveInteger(maxAgeHours, 'maxAgeHours');
      requirePositiveInteger(batchSize, 'batchSize');

      const candidates = await unitOfWork.execute((ports) => {
        const findCandidates = ports.creditReservation.findStaleClosingCandidates;
        if (findCandidates === undefined) {
          throw new Error('stale closing reservation capability unavailable');
        }
        return findCandidates({ maxAgeHours, batchSize });
      });
      let closed = 0;

      for (const candidate of candidates) {
        const didClose = await unitOfWork.execute(async (ports) => {
          const project = await ports.project.lockForUpdate(candidate.projectId);
          if (project === null) return false;

          const job = await ports.job.lockForReconciliation({
            projectId: candidate.projectId,
            jobId: candidate.jobId,
          });
          if (
            job === null ||
            job.reservationId !== candidate.reservationId ||
            !['succeeded', 'failed', 'dead', 'cancelled'].includes(job.status)
          ) {
            return false;
          }

          const lockStale = ports.creditReservation.lockStaleClosingBound;
          if (lockStale === undefined) {
            throw new Error('stale closing reservation capability unavailable');
          }
          const reservation = await lockStale({ ...candidate, maxAgeHours });
          if (reservation === null) return false;

          await reconcileTerminalReservation(ports, {
            ownerUserId: project.ownerUserId,
            job,
            terminalReason: job.status === 'cancelled' ? 'cancelled' : 'released',
            ignoreUnresolvedAttempts: true,
          });
          return true;
        });
        if (didClose) closed += 1;
      }

      return { discovered: candidates.length, closed };
    },
  };
}
