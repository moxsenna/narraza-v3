import type {
  WorkflowPlanCreateInput,
  WorkflowPlanPort,
  WorkflowPlanRecord,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * `WorkflowPlanPort` adapter over `ai_workflow_plans` (Block B).
 *
 * Plans are append-only with replay keyed by `(project_id, plan_hash)`. Every
 * binding is verified inside the same transaction and fails closed: the
 * bundle must exist and belong to the project (composite FK plus an explicit
 * pre-check for a typed outcome), and every price snapshot referenced by the
 * routing payload must already be seeded. Payload JSONB is checked against the
 * schema's object constraint by construction.
 */
export function createWorkflowPlanPort(tx: TxClient): WorkflowPlanPort {
  const COLUMNS = `id, project_id, bundle_id, workflow_kind, plan_hash,
         estimated_max_micro_idr, schema_version, payload`;

  function toRecord(row: Record<string, unknown>): WorkflowPlanRecord {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      bundleId: row.bundle_id as string,
      workflowKind: row.workflow_kind as string,
      planHash: row.plan_hash as string,
      estimatedMaxMicroIdr: BigInt(row.estimated_max_micro_idr as string | bigint),
      schemaVersion: row.schema_version as number,
      payload: row.payload as WorkflowPlanRecord['payload'],
    };
  }

  return {
    async createPlan(
      input: WorkflowPlanCreateInput,
    ): Promise<{ kind: 'created' } | { kind: 'bundle_not_found' }> {
      const bundle = (await tx.$queryRawUnsafe(
        `SELECT id FROM generation_context_bundles
          WHERE project_id = $1 AND id = $2
          FOR KEY SHARE`,
        input.projectId,
        input.bundleId,
      )) as Array<{ id: string }>;
      if (!bundle[0]) return { kind: 'bundle_not_found' };

      for (const priceSnapshotId of input.priceSnapshotIds) {
        const price = (await tx.$queryRawUnsafe(
          `SELECT id FROM model_price_snapshots WHERE id = $1`,
          priceSnapshotId,
        )) as Array<{ id: string }>;
        if (!price[0]) {
          throw new Error(`workflow plan: unknown price snapshot '${priceSnapshotId}'`);
        }
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO ai_workflow_plans
           (id, project_id, bundle_id, workflow_kind, plan_hash,
            estimated_max_micro_idr, schema_version, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (project_id, plan_hash) DO NOTHING`,
        input.id,
        input.projectId,
        input.bundleId,
        input.workflowKind,
        input.planHash,
        input.estimatedMaxMicroIdr,
        input.schemaVersion ?? 1,
        JSON.stringify(input.payload),
      );
      return { kind: 'created' };
    },

    async findPlanByHash(projectId: string, planHash: string) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMNS}
           FROM ai_workflow_plans
          WHERE project_id = $1 AND plan_hash = $2
          LIMIT 1`,
        projectId,
        planHash,
      )) as Array<Record<string, unknown>>;
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async findPlanById(projectId: string, planId: string) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMNS}
           FROM ai_workflow_plans
          WHERE project_id = $1 AND id = $2
          LIMIT 1`,
        projectId,
        planId,
      )) as Array<Record<string, unknown>>;
      return rows[0] ? toRecord(rows[0]) : null;
    },
  };
}
