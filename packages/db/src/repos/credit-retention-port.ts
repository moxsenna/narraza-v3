import type {
  CreditRetentionPort,
  CreditRetentionSweepResult,
  DeleteEligibleCreditRetentionInput,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface DeletedCountRow {
  deleted_count: number | bigint;
}

export function createCreditRetentionPort(tx: TxClient): CreditRetentionPort {
  return {
    async deleteEligible(
      input: DeleteEligibleCreditRetentionInput,
    ): Promise<CreditRetentionSweepResult> {
      const quoteRows = (await tx.$queryRawUnsafe(
        `WITH candidates AS (
           SELECT q.id, q.created_at
             FROM credit_quotes q
            WHERE q.created_at < (NOW() - ($1::integer * interval '1 hour'))::timestamptz(3)
              AND q.consumed_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM credit_reservations r WHERE r.quote_id = q.id
              )
            ORDER BY q.created_at, q.id
            LIMIT $2
            FOR UPDATE OF q SKIP LOCKED
         ), deleted AS (
           DELETE FROM credit_quotes q
            USING candidates c
            WHERE q.id = c.id
              AND q.created_at = c.created_at
              AND q.created_at < (NOW() - ($1::integer * interval '1 hour'))::timestamptz(3)
              AND q.consumed_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM credit_reservations r WHERE r.quote_id = q.id
              )
           RETURNING q.id
         )
         SELECT count(*)::integer AS deleted_count FROM deleted`,
        input.maxAgeHours,
        input.batchSize,
      )) as DeletedCountRow[];

      const bundleRows = (await tx.$queryRawUnsafe(
        `WITH candidates AS (
           SELECT b.id, b.project_id, b.created_at
             FROM generation_context_bundles b
            WHERE b.created_at < (NOW() - ($1::integer * interval '1 hour'))::timestamptz(3)
              AND b.consumed_at IS NULL
              AND NOT EXISTS (
                SELECT 1
                  FROM ai_workflow_plans p
                 WHERE p.project_id = b.project_id AND p.bundle_id = b.id
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM generation_jobs j
                 WHERE j.project_id = b.project_id AND j.bundle_id = b.id
              )
            ORDER BY b.created_at, b.id
            LIMIT $2
            FOR UPDATE OF b SKIP LOCKED
         ), deleted AS (
           DELETE FROM generation_context_bundles b
            USING candidates c
            WHERE b.project_id = c.project_id
              AND b.id = c.id
              AND b.created_at = c.created_at
              AND b.created_at < (NOW() - ($1::integer * interval '1 hour'))::timestamptz(3)
              AND b.consumed_at IS NULL
              AND NOT EXISTS (
                SELECT 1
                  FROM ai_workflow_plans p
                 WHERE p.project_id = b.project_id AND p.bundle_id = b.id
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM generation_jobs j
                 WHERE j.project_id = b.project_id AND j.bundle_id = b.id
              )
           RETURNING b.id
         )
         SELECT count(*)::integer AS deleted_count FROM deleted`,
        input.maxAgeHours,
        input.batchSize,
      )) as DeletedCountRow[];

      return {
        deletedQuotes: Number(quoteRows[0]?.deleted_count ?? 0),
        deletedBundles: Number(bundleRows[0]?.deleted_count ?? 0),
      };
    },
  };
}
