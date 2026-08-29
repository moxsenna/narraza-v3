import { ai } from '@narraza/core';
const { canonicalPlanHash, validateWorkflowPlanSpec, worstCaseBudgetMicroIdr, WorkflowPlanError } =
  ai;
type AiWorkflowPlanSpec = ai.AiWorkflowPlanSpec;
type PriceSnapshotLike = ai.PriceSnapshotLike;
type PlanHashInput = ai.PlanHashInput;
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { WorkflowPlanRecord } from './workflow-plan-port.js';

/**
 * Block B: compiles and freezes the workflow plan for a paid generation
 * request (S5.1/S5.2).
 *
 * The builder is pure with respect to its inputs: given the same workflow
 * kind, stage templates and price snapshots it produces the same semantic
 * spec, the same 64-hex `planHash` and the same worst-case budget. Nothing
 * runtime (createdAt, caller ids, worker identity) enters the hashed payload.
 * Stage templates are frozen and fail closed on unknown workflow kinds.
 */

export type BuildPlanErrorCode =
  'unknown_workflow_kind' | 'price_snapshot_not_found' | 'invalid_plan';

/** Frozen stage templates per workflow kind (server-side; never sent raw to clients). */
const WORKFLOW_STAGE_TEMPLATES: Readonly<
  Record<
    string,
    readonly {
      readonly stageKey: string;
      readonly purpose: AiWorkflowPlanSpec['stages'][number]['purpose'];
      readonly packetKind: AiWorkflowPlanSpec['stages'][number]['packetKind'];
      readonly dataClass: string;
      readonly runPolicy: AiWorkflowPlanSpec['stages'][number]['runPolicy'];
    }[]
  >
> = Object.freeze({
  chat_intake: [intakeStage()],
  chat_intake_reply: [intakeStage()],
  intake_reply: [intakeStage()],
  concept_generation: [plannerGenerate('concepts')],
  create_concepts: [plannerGenerate('concepts')],
  foundation_generation: [plannerGenerate('foundation')],
  character_generation: [plannerGenerate('characters')],
  outline_generation: [plannerGenerate('outline')],
  scene_generation: [...beatWriteStages()],
  beat_write_judge: [...beatWriteStages()],
  safe_repair: [
    {
      stageKey: 'repair',
      purpose: 'structured_repair',
      packetKind: 'repair',
      dataClass: 'writer_safe',
      runPolicy: 'always',
    },
  ],
  publish_package: [
    {
      stageKey: 'publish_package',
      purpose: 'extraction',
      packetKind: 'extraction',
      dataClass: 'review_safe',
      runPolicy: 'always',
    },
  ],
} as const);

function intakeStage() {
  return {
    stageKey: 'intake_reply',
    purpose: 'extraction' as const,
    packetKind: 'extraction' as const,
    dataClass: 'review_safe',
    runPolicy: 'always' as const,
  };
}

function plannerGenerate(stageKey: string) {
  return {
    stageKey,
    purpose: 'generate' as const,
    packetKind: 'planner' as const,
    dataClass: 'author_private',
    runPolicy: 'always' as const,
  };
}

function beatWriteStages() {
  return [
    {
      stageKey: 'writer',
      purpose: 'generate' as const,
      packetKind: 'writer' as const,
      dataClass: 'writer_safe',
      runPolicy: 'always' as const,
    },
    {
      stageKey: 'judge',
      purpose: 'judge' as const,
      packetKind: 'validator' as const,
      dataClass: 'author_private',
      runPolicy: 'always' as const,
    },
  ];
}

export interface BuildWorkflowPlanInput {
  readonly projectId: string;
  readonly workflowKind: string;
  /**
   * Execution profile applied to every stage (routing candidates for real
   * multi-provider routing arrive with W4.5; the frozen shape already carries
   * the candidate list).
   */
  readonly profile: AiWorkflowPlanSpec['stages'][number]['routing'][number];
  /** Immutable price snapshots backing the worst-case budget. */
  readonly priceSnapshots: readonly PriceSnapshotLike[];
}

export interface FrozenWorkflowPlan {
  readonly spec: AiWorkflowPlanSpec;
  readonly estimatedMaxMicroIdr: bigint;
}

export type BuildWorkflowPlanResult =
  | { readonly kind: 'built'; readonly plan: FrozenWorkflowPlan }
  | { readonly kind: 'invalid'; readonly errorCode: BuildPlanErrorCode };

export function buildWorkflowPlan(input: BuildWorkflowPlanInput): BuildWorkflowPlanResult {
  const template = WORKFLOW_STAGE_TEMPLATES[input.workflowKind];
  if (!template) return { kind: 'invalid', errorCode: 'unknown_workflow_kind' };

  const spec: AiWorkflowPlanSpec = {
    schemaVersion: 1,
    workflowKind: input.workflowKind,
    stages: template.map((stage) => ({
      ...stage,
      routing: [input.profile],
    })),
  };

  try {
    const estimatedMaxMicroIdr = worstCaseBudgetMicroIdr(spec, input.priceSnapshots);
    return {
      kind: 'built',
      plan: {
        spec,
        estimatedMaxMicroIdr,
      },
    };
  } catch (error) {
    if (error instanceof WorkflowPlanError && error.code === 'unknown_price_snapshot') {
      return { kind: 'invalid', errorCode: 'price_snapshot_not_found' };
    }
    return { kind: 'invalid', errorCode: 'invalid_plan' };
  }
}

/** Persists a built plan; replay keyed by (projectId, planHash). */
export function createWorkflowPlanFreezeService(deps: { unitOfWork: UnitOfWork }) {
  return {
    async freezePlan(input: {
      planId: string;
      projectId: string;
      bundleId: string;
      dependencyHash: string;
      bundleHash: string;
      plan: FrozenWorkflowPlan;
    }): Promise<
      | { kind: 'frozen' | 'replayed'; record: WorkflowPlanRecord }
      | { kind: 'invalid'; errorCode: 'invalid_plan' | 'bundle_not_found' }
    > {
      const { plan } = input;
      try {
        validateWorkflowPlanSpec(plan.spec);
      } catch {
        return { kind: 'invalid', errorCode: 'invalid_plan' };
      }
      const hashInput: PlanHashInput = {
        spec: plan.spec,
        input: { dependencyHash: input.dependencyHash, bundleHash: input.bundleHash },
      };
      const planHash = canonicalPlanHash(hashInput);
      const priceSnapshotIds = [
        ...new Set(
          plan.spec.stages.flatMap((stage) => stage.routing.map((r) => r.priceSnapshotId)),
        ),
      ];
      return deps.unitOfWork.execute(async (ports) => {
        const workflowPlan = ports.workflowPlan;
        if (!workflowPlan) {
          throw new Error('workflow plan freeze: workflowPlan port not configured');
        }
        const existing = await workflowPlan.findPlanByHash(input.projectId, planHash);
        if (existing) return { kind: 'replayed' as const, record: existing };
        const created = await workflowPlan.createPlan({
          id: input.planId,
          projectId: input.projectId,
          bundleId: input.bundleId,
          workflowKind: plan.spec.workflowKind,
          planHash,
          estimatedMaxMicroIdr: plan.estimatedMaxMicroIdr,
          schemaVersion: plan.spec.schemaVersion,
          payload: plan.spec as unknown as import('../ports/types.js').JsonObject,
          priceSnapshotIds,
        });
        if (created.kind === 'bundle_not_found') {
          return { kind: 'invalid' as const, errorCode: 'bundle_not_found' };
        }
        const record = await workflowPlan.findPlanByHash(input.projectId, planHash);
        if (!record) return { kind: 'invalid' as const, errorCode: 'invalid_plan' };
        return { kind: 'frozen' as const, record };
      });
    },
  };
}
