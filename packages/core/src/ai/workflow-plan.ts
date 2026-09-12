import { canonicalSha256 } from '../dependency/canonical-json.js';

/**
 * Frozen AIWorkflowPlan domain (S5, Block B).
 *
 * A plan is the pure, immutable description of one paid generation workflow:
 * an ordered stage list, each stage with its context packet kind, its routing
 * candidates (execution profiles in explicit preference order) and its
 * invocation ceiling. Routing candidates are chosen EXPLICITLY by the
 * orchestrator per attempt — a fallback candidate is a new attempt, never a
 * hidden retry inside a provider call.
 *
 * The plan hash is computed over the canonical serialization of the semantic
 * plan payload only. Runtime data (createdAt, caller ids, worker identity,
 * random tokens) must never enter the hash: replaying an identical semantic
 * plan yields the same hash, and any material routing/budget/stage change
 * yields a different one.
 */

export const WORKFLOW_PLAN_SCHEMA_VERSION = 1 as const;

export type WorkflowStagePurpose =
  | 'generate'
  | 'judge'
  | 'structured_repair'
  | 'judge_output_repair'
  | 'parse_repair'
  | 'extraction';

export type WorkflowPacketKind = 'planner' | 'writer' | 'validator' | 'repair' | 'extraction';

/** When a stage runs relative to the previous stage's outcome. */
export type WorkflowStageRunPolicy =
  'always' | 'on_parse_failure' | 'on_judge_fail' | 'on_repairable_failure';

export interface StageExecutionProfile {
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly resolvedModelId: string;
  readonly structuredOutput: boolean;
  readonly timeoutMs: number;
  /** Deterministic per-call token ceilings used for worst-case budgeting. */
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly priceSnapshotId: string;
  /** Attempt ceiling for this profile; attempts are counted per stage. */
  readonly maxInvocations: number;
}

export interface WorkflowPlanStage {
  readonly stageKey: string;
  readonly purpose: WorkflowStagePurpose;
  readonly packetKind: WorkflowPacketKind;
  readonly dataClass: string;
  readonly runPolicy: WorkflowStageRunPolicy;
  /** Ordered candidates; index 0 is the primary route. */
  readonly routing: readonly StageExecutionProfile[];
}

export interface AiWorkflowPlanSpec {
  readonly schemaVersion: typeof WORKFLOW_PLAN_SCHEMA_VERSION;
  readonly workflowKind: string;
  readonly stages: readonly WorkflowPlanStage[];
}

export class WorkflowPlanError extends Error {
  constructor(
    readonly code: WorkflowPlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowPlanError';
  }
}

export type WorkflowPlanErrorCode =
  | 'invalid_stage'
  | 'invalid_profile'
  | 'empty_routing'
  | 'invalid_data_class'
  | 'duplicate_stage_key'
  | 'unknown_price_snapshot'
  | 'non_positive_rate';

const PURPOSES: readonly WorkflowStagePurpose[] = [
  'generate',
  'judge',
  'structured_repair',
  'judge_output_repair',
  'parse_repair',
  'extraction',
];
const PACKET_KINDS: readonly WorkflowPacketKind[] = [
  'planner',
  'writer',
  'validator',
  'repair',
  'extraction',
];
const RUN_POLICIES: readonly WorkflowStageRunPolicy[] = [
  'always',
  'on_parse_failure',
  'on_judge_fail',
  'on_repairable_failure',
];

function requireNonNegative(value: number, code: WorkflowPlanErrorCode, what: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WorkflowPlanError(code, `workflow plan: ${what} must be a positive integer`);
  }
}

/** Validates a spec shape; fails closed on anything unexpected. */
export function validateWorkflowPlanSpec(spec: AiWorkflowPlanSpec): void {
  if (spec.schemaVersion !== WORKFLOW_PLAN_SCHEMA_VERSION) {
    throw new WorkflowPlanError('invalid_stage', 'workflow plan: unsupported schema version');
  }
  const seen = new Set<string>();
  spec.stages.forEach((stage, index) => {
    if (!PURPOSES.includes(stage.purpose)) {
      throw new WorkflowPlanError('invalid_stage', `workflow plan: stage ${index} purpose`);
    }
    if (!PACKET_KINDS.includes(stage.packetKind)) {
      throw new WorkflowPlanError('invalid_stage', `workflow plan: stage ${index} packetKind`);
    }
    if (!RUN_POLICIES.includes(stage.runPolicy)) {
      throw new WorkflowPlanError('invalid_stage', `workflow plan: stage ${index} runPolicy`);
    }
    if (seen.has(stage.stageKey)) {
      throw new WorkflowPlanError('duplicate_stage_key', `workflow plan: stage ${stage.stageKey}`);
    }
    seen.add(stage.stageKey);
    if (stage.routing.length === 0) {
      throw new WorkflowPlanError('empty_routing', `workflow plan: stage ${stage.stageKey}`);
    }
    stage.routing.forEach((profile, profileIndex) => {
      if (typeof profile.providerId !== 'string' || profile.providerId === '') {
        throw new WorkflowPlanError('invalid_profile', `workflow plan: stage ${index} provider`);
      }
      requireNonNegative(
        profile.timeoutMs,
        'invalid_profile',
        `stage ${index} profile ${profileIndex} timeoutMs`,
      );
      requireNonNegative(
        profile.maxInputTokens,
        'invalid_profile',
        `stage ${index} profile ${profileIndex} maxInputTokens`,
      );
      requireNonNegative(
        profile.maxOutputTokens,
        'invalid_profile',
        `stage ${index} profile ${profileIndex} maxOutputTokens`,
      );
      requireNonNegative(
        profile.maxInvocations,
        'invalid_profile',
        `stage ${index} profile ${profileIndex} maxInvocations`,
      );
    });
  });
}

export interface PlanHashInput {
  readonly spec: AiWorkflowPlanSpec;
  /** The frozen input the plan was compiled from: a plan is bound to the
   * exact bundle and dependency state it was built against, so a source
   * change yields a NEW plan even when the stage template is identical. */
  readonly input: {
    readonly dependencyHash: string;
    readonly bundleHash: string;
  };
}

/**
 * Deterministic plan hash: 64-char lowercase hex over the canonical
 * serialization of the semantic plan payload — the spec AND its input
 * binding. Stage order is material (it is the execution contract); object
 * key order is not (canonical JSON sorts). Runtime data (createdAt, caller
 * ids, worker identity) must never enter this payload.
 */
export function canonicalPlanHash(payload: PlanHashInput): string {
  validateWorkflowPlanSpec(payload.spec);
  return canonicalSha256({
    planHashVersion: 1,
    plan: payload.spec,
    input: payload.input,
  });
}

export interface PriceSnapshotLike {
  readonly id: string;
  readonly inputRateMicroIdr: bigint;
  readonly outputRateMicroIdr: bigint;
}

/**
 * Worst-case budget: Σ over stages of (per-call ceiling × maxInvocations),
 * where the per-call ceiling is the integer sum of both token ceilings priced
 * at the referenced immutable snapshot. Ceiling semantics — never below the
 * worst case, no markup, no user-facing rounding here.
 */
export function worstCaseBudgetMicroIdr(
  spec: AiWorkflowPlanSpec,
  priceSnapshots: readonly PriceSnapshotLike[],
): bigint {
  validateWorkflowPlanSpec(spec);
  const byId = new Map(priceSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  let total = 0n;
  for (const stage of spec.stages) {
    for (const profile of stage.routing) {
      const price = byId.get(profile.priceSnapshotId);
      if (!price) {
        throw new WorkflowPlanError(
          'unknown_price_snapshot',
          `workflow plan: stage ${stage.stageKey} references unknown price snapshot ${profile.priceSnapshotId}`,
        );
      }
      if (price.inputRateMicroIdr < 0n || price.outputRateMicroIdr < 0n) {
        throw new WorkflowPlanError('non_positive_rate', 'workflow plan: negative rate');
      }
      const perCall =
        BigInt(profile.maxInputTokens) * price.inputRateMicroIdr +
        BigInt(profile.maxOutputTokens) * price.outputRateMicroIdr;
      total += perCall * BigInt(profile.maxInvocations);
    }
  }
  return total;
}
