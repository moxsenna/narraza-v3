import type { AttemptRecoveryPort } from '@narraza/application';
import { orphanAttemptPayload } from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * `AttemptRecoveryPort` adapter over `generation_attempts` +
 * `workflow_invocations` (Block C, PM Decision 2).
 *
 * Closing an orphan is a durable CAS: only rows still `started` flip to
 * `failed` with `finished_at` stamped by the PostgreSQL clock (the lifecycle
 * CHECK stays satisfied) and a worker-loss / usage-uncertain payload marker.
 * The abandoned attempt keeps its ordinal, so it counts against the stage
 * invocation cap; it can never win (winners require `succeeded`) and never
 * contributes to user settlement (billing allocations sum winner costs only).
 */
export function createAttemptRecoveryPort(tx: TxClient): AttemptRecoveryPort {
  return {
    async closeOrphanedStartedAttempts(input) {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_attempts a
            SET status = 'failed',
                finished_at = now(),
                payload = a.payload || $3::jsonb,
                updated_at = now()
           FROM workflow_invocations i
          WHERE i.id = a.invocation_id
            AND i.project_id = $1
            AND i.job_id = $2
            AND a.status = 'started'
          RETURNING a.id`,
        input.projectId,
        input.jobId,
        JSON.stringify(orphanAttemptPayload(input.errorCode)),
      )) as Array<{ id: string }>;
      return { closed: rows.length };
    },

    async countStageAttempts(input) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT count(*)::int AS count
           FROM generation_attempts a
           JOIN workflow_invocations i ON i.id = a.invocation_id
          WHERE i.project_id = $1
            AND i.job_id = $2
            AND i.stage_key = $3`,
        input.projectId,
        input.jobId,
        input.stageKey,
      )) as Array<{ count: number }>;
      return rows[0]!.count;
    },
  };
}
