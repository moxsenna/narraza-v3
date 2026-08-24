import type { UsableOutputClassifier } from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface CandidateOutputRow {
  id: string;
  prose_version_id: string;
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
        `SELECT id,prose_version_id,payload
           FROM generated_candidates
          WHERE project_id = $1
            AND job_id = $2
            AND prose_version_id IS NOT NULL
          ORDER BY id`,
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
