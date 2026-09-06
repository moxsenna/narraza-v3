import type { JsonObject } from '../ports/types.js';

/**
 * Recovery contract for attempts orphaned by worker loss (PM Decision 2,
 * Block C).
 *
 * When a worker dies after Tx A, its attempt stays `started`. Recovery rules
 * (frozen): the attempt is NEVER reused and the provider call is never
 * assumed absent; the orphan is durably closed as `failed` with a
 * worker-loss / usage-uncertain marker; it still counts against the stage
 * invocation cap; the replacement attempt gets a NEW id; it can never win or
 * publish; and it contributes ZERO user settlement — any later-provable
 * provider liability for the abandoned call is a SYSTEM cost.
 *
 * No schema change is needed: `failed` is an existing attempt status, the
 * lifecycle CHECK holds (finished_at set), and the uncertainty marker lives in
 * the attempt payload JSONB.
 */
export interface RecoveredStageOutcome {
  readonly stageKey: string;
  readonly status: 'succeeded' | 'failed';
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface AttemptRecoveryPort {
  /** Durably closes every `started` attempt of the job as failed/abandoned. */
  closeOrphanedStartedAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly errorCode: string;
  }): Promise<{ readonly closed: number }>;

  /** Hydrates usable winners plus failed parse/validation outcomes needed to resume repairs. */
  loadStageWinners(input: {
    readonly projectId: string;
    readonly jobId: string;
  }): Promise<readonly RecoveredStageOutcome[]>;

  /** Total attempts recorded for the stage (used, includes abandoned ones). */
  countStageAttempts(input: {
    readonly projectId: string;
    readonly jobId: string;
    readonly stageKey: string;
  }): Promise<number>;
}

export const ORPHAN_ATTEMPT_ERROR_CODE = 'attempt_abandoned_worker_loss' as const;

export function orphanAttemptPayload(errorCode: string): JsonObject {
  return {
    recovery: 'worker_loss',
    usageUncertain: true,
    errorCode,
  };
}
