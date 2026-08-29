import type { UnitOfWork } from '../ports/unit-of-work.js';
import { orphanAttemptPayload } from './attempt-recovery-port.js';

/**
 * UoW-backed facade over the tx-scoped {@link AttemptRecoveryPort}. Each call
 * runs in its own short READ COMMITTED transaction, matching the orchestrator
 * sequencing: recovery closes orphans before any new stage begins, and stage
 * attempt counts include abandoned ones (PM Decision 2).
 */
export function createAttemptRecoveryService(deps: { unitOfWork: UnitOfWork }) {
  return {
    async closeOrphanedStartedAttempts(input: {
      projectId: string;
      jobId: string;
      errorCode: string;
    }): Promise<{ closed: number }> {
      return deps.unitOfWork.execute(async (ports) => {
        const recovery = ports.attemptRecovery;
        if (!recovery) {
          throw new Error('attempt recovery: attemptRecovery port not configured');
        }
        return recovery.closeOrphanedStartedAttempts(input);
      });
    },

    async countStageAttempts(input: {
      projectId: string;
      jobId: string;
      stageKey: string;
    }): Promise<number> {
      return deps.unitOfWork.execute(async (ports) => {
        const recovery = ports.attemptRecovery;
        if (!recovery) {
          throw new Error('attempt recovery: attemptRecovery port not configured');
        }
        return recovery.countStageAttempts(input);
      });
    },
  };
}

// Re-exported so composition can build the payload without the port import.
export { orphanAttemptPayload };
