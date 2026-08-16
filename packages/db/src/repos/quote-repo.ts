import type {
  CreditQuoteRecord,
  QuoteInsertInput,
  QuoteInsertResult,
  QuotePort,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const COLUMN_LIST = `id,user_id,project_id,workflow_plan_project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,consumed_at,request_id,created_at`;

interface RawQuoteRow {
  id: string;
  user_id: string;
  project_id: string;
  workflow_plan_project_id: string | null;
  workflow_plan_id: string | null;
  workflow_plan_hash: string;
  dependency_hash: string;
  max_amount_micro_idr: string | bigint;
  expires_at: Date;
  consumed_at: Date | null;
  request_id: string | null;
  created_at: Date;
}

function toQuoteRecord(row: RawQuoteRow): CreditQuoteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    workflowPlanProjectId: row.workflow_plan_project_id,
    workflowPlanId: row.workflow_plan_id,
    workflowPlanHash: row.workflow_plan_hash,
    dependencyHash: row.dependency_hash,
    maxAmountMicroIdr: BigInt(row.max_amount_micro_idr),
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

function isExactReplay(
  row: RawQuoteRow,
  input: QuoteInsertInput,
  resolvedExistingBundleId: string | null,
): boolean {
  return (
    row.user_id === input.userId &&
    row.project_id === input.projectId &&
    row.workflow_plan_id === input.workflowPlanId &&
    row.workflow_plan_hash === input.workflowPlanHash &&
    resolvedExistingBundleId === input.bundleId &&
    row.dependency_hash === input.dependencyHash &&
    BigInt(row.max_amount_micro_idr) === input.maxAmountMicroIdr &&
    row.request_id === input.requestId
  );
}

export function createQuoteRepo(tx: TxClient): QuotePort {
  async function resolveBundleIdForPlan(
    projectId: string,
    workflowPlanId: string | null,
  ): Promise<string | null> {
    if (workflowPlanId === null) return null;
    const planRows = (await tx.$queryRawUnsafe(
      `SELECT bundle_id FROM ai_workflow_plans WHERE project_id = $1 AND id = $2`,
      projectId,
      workflowPlanId,
    )) as { bundle_id: string }[];
    return planRows[0]?.bundle_id ?? null;
  }

  return {
    async insert(input: QuoteInsertInput): Promise<QuoteInsertResult> {
      // 1. If requestId is supplied, check for existing quote under that requestId first (handles replays before freshness check)
      if (input.requestId !== null) {
        const existing = (await tx.$queryRawUnsafe(
          `SELECT ${COLUMN_LIST}
             FROM credit_quotes
            WHERE request_id = $1`,
          input.requestId,
        )) as RawQuoteRow[];

        const existingRow = existing[0];
        if (existingRow) {
          const existingBundleId = await resolveBundleIdForPlan(
            existingRow.project_id,
            existingRow.workflow_plan_id,
          );
          if (isExactReplay(existingRow, input, existingBundleId)) {
            return { kind: 'replayed', quote: toQuoteRecord(existingRow) };
          }
          return { kind: 'conflict' };
        }
      }

      // 2. Audit and validate bundle binding when workflowPlanId is provided for fresh insert
      if (input.workflowPlanId !== null) {
        if (input.bundleId === null) {
          return { kind: 'invalid_bundle_binding' };
        }
        const planRows = (await tx.$queryRawUnsafe(
          `SELECT bundle_id
             FROM ai_workflow_plans
            WHERE project_id = $1 AND id = $2 AND plan_hash = $3`,
          input.projectId,
          input.workflowPlanId,
          input.workflowPlanHash,
        )) as { bundle_id: string }[];

        const planRow = planRows[0];
        if (!planRow) {
          return { kind: 'plan_not_found' };
        }
        if (planRow.bundle_id !== input.bundleId) {
          return { kind: 'invalid_bundle_binding' };
        }
      } else {
        // Fail closed if workflowPlanId === null && bundleId !== null
        if (input.bundleId !== null) {
          return { kind: 'invalid_bundle_binding' };
        }
      }

      // 3. Attempt insert with PostgreSQL operational time (default expiry = now() + 10 minutes)
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_quotes
           (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,
            max_amount_micro_idr,expires_at,consumed_at,request_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now() + interval '10 minutes',NULL,$8,now())
         ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
         RETURNING ${COLUMN_LIST}`,
        input.id,
        input.userId,
        input.projectId,
        input.workflowPlanId,
        input.workflowPlanHash,
        input.dependencyHash,
        input.maxAmountMicroIdr,
        input.requestId,
      )) as RawQuoteRow[];

      const row = inserted[0];
      if (row) {
        return { kind: 'inserted', quote: toQuoteRecord(row) };
      }

      // 4. Insert missed due to concurrent conflict on request_id partial unique index
      if (input.requestId !== null) {
        const concurrent = (await tx.$queryRawUnsafe(
          `SELECT ${COLUMN_LIST}
             FROM credit_quotes
            WHERE request_id = $1`,
          input.requestId,
        )) as RawQuoteRow[];

        const concurrentRow = concurrent[0];
        if (concurrentRow) {
          const concurrentBundleId = await resolveBundleIdForPlan(
            concurrentRow.project_id,
            concurrentRow.workflow_plan_id,
          );
          if (isExactReplay(concurrentRow, input, concurrentBundleId)) {
            return { kind: 'replayed', quote: toQuoteRecord(concurrentRow) };
          }
        }
      }

      return { kind: 'conflict' };
    },

    async findById(id: string): Promise<CreditQuoteRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM credit_quotes
          WHERE id = $1`,
        id,
      )) as RawQuoteRow[];
      const row = rows[0];
      return row ? toQuoteRecord(row) : null;
    },

    async findByRequestId(userId: string, requestId: string): Promise<CreditQuoteRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM credit_quotes
          WHERE user_id = $1 AND request_id = $2`,
        userId,
        requestId,
      )) as RawQuoteRow[];
      const row = rows[0];
      return row ? toQuoteRecord(row) : null;
    },
  };
}
