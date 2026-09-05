import type { AttemptRecoveryPort, JsonObject } from '@narraza/application';
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

    async loadStageWinners(input) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT stage_key, status, schema_version, payload
           FROM (
             SELECT DISTINCT ON (i.stage_key)
                    i.stage_key, i.created_at, a.status, a.schema_version, a.payload
               FROM workflow_invocations i
               JOIN generation_attempts a
                 ON a.project_id = i.project_id
                AND a.job_id = i.job_id
                AND a.invocation_id = i.id
              WHERE i.project_id = $1
                AND i.job_id = $2
                AND (
                  (i.status = 'succeeded' AND a.id = i.winner_attempt_id AND a.status = 'succeeded')
                  OR
                  (i.status = 'running' AND a.status = 'failed' AND
                    (a.payload->>'parseFailed' = 'true' OR a.payload->>'validationFailed' = 'true'))
                )
              ORDER BY i.stage_key,
                       (a.id = i.winner_attempt_id) DESC,
                       a.ordinal DESC
           ) recovered
          ORDER BY created_at, stage_key`,
        input.projectId,
        input.jobId,
      )) as Array<{
        stage_key: string;
        status: 'succeeded' | 'failed';
        schema_version: number;
        payload: unknown;
      }>;
      return rows.map((row) => ({
        stageKey: row.stage_key,
        status: row.status,
        schemaVersion: row.schema_version,
        payload: row.payload as JsonObject,
      }));
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
