import type { JsonObject } from '../ports/types.js';

/**
 * Persistence contract for frozen `AiWorkflowPlan` rows (S5, Block B).
 *
 * A plan row pins: the workflow kind, the canonical plan hash, the frozen
 * semantic plan payload, the worst-case budget, and the bundle it was compiled
 * against. Plans are append-only — replay is keyed by
 * `(projectId, planHash)`. The adapter verifies every binding (project,
 * bundle, price snapshots referenced by routing) inside the same transaction
 * and fails closed on any unknown or inconsistent reference.
 */
export interface WorkflowPlanRecord {
  readonly id: string;
  readonly projectId: string;
  readonly bundleId: string;
  readonly workflowKind: string;
  readonly planHash: string;
  readonly estimatedMaxMicroIdr: bigint;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface WorkflowPlanCreateInput {
  readonly id: string;
  readonly projectId: string;
  readonly bundleId: string;
  readonly workflowKind: string;
  readonly planHash: string;
  readonly estimatedMaxMicroIdr: bigint;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
  /** Every priceSnapshotId referenced by the plan's routing must be listed. */
  readonly priceSnapshotIds: readonly string[];
}

export interface WorkflowPlanPort {
  createPlan(
    input: WorkflowPlanCreateInput,
  ): Promise<{ kind: 'created' } | { kind: 'bundle_not_found' }>;
  findPlanByHash(projectId: string, planHash: string): Promise<WorkflowPlanRecord | null>;
  findPlanById(projectId: string, planId: string): Promise<WorkflowPlanRecord | null>;
}
