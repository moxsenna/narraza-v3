import type { UsableOutputClassifier } from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface CandidateOutputRow {
  id: string;
  prose_version_id: string;
  source_candidate_id: string;
  payload: unknown;
}

/**
 * W3.3 classifier for current durable candidate publication seam.
 * Sentinel/outbox rows never participate. Candidate must point at published prose.
 */
export function createUsableOutputClassifier(tx: TxClient): UsableOutputClassifier {
  return {
    async classifyPublishedOutput(input) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT gc.id,gc.prose_version_id,pv.source_candidate_id,gc.payload
           FROM generated_candidates gc
           JOIN prose_versions pv
             ON pv.project_id=gc.project_id
            AND pv.id=gc.prose_version_id
            AND pv.source_candidate_id=gc.id
          WHERE gc.project_id = $1
            AND gc.job_id = $2
            AND gc.prose_version_id IS NOT NULL
          ORDER BY gc.id
          FOR UPDATE OF gc,pv`,
        input.projectId,
        input.jobId,
      )) as CandidateOutputRow[];

      if (rows.length === 0) return { kind: 'zero_output' };
      if (rows.length !== 1) {
        throw new Error('usable-output classifier found ambiguous published outputs');
      }

      const row = rows[0]!;
      const payload = isObject(row.payload) ? row.payload : {};
      const contributingAttemptIds = payload.contributingAttemptIds;
      if (!isNonEmptyStringArray(contributingAttemptIds)) {
        throw new Error('usable-output classifier missing contributing attempt evidence');
      }

      return {
        kind: 'usable',
        outputKind: 'prose_version',
        outputRef: row.prose_version_id,
        contributingAttemptIds: [...new Set(contributingAttemptIds)].sort(),
      };
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  );
}
