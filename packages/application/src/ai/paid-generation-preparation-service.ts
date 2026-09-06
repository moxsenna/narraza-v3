import type { UnitOfWork } from '../ports/unit-of-work.js';
import { createCreditQuoteService } from '../credits/quote-service.js';
import {
  buildWorkflowPlan,
  createWorkflowPlanFreezeService,
  type BuildPlanErrorCode,
  type BuildWorkflowPlanInput,
  type FrozenWorkflowPlan,
} from './workflow-plan-freeze-service.js';
import {
  createContextBundleFreezeService,
  type FreezeBundleErrorCode,
  type FreezeBundleInput,
  type FrozenBundle,
} from './context-bundle-freeze-service.js';
import type { CreditQuoteRecord } from '../ports/types.js';

/**
 * Block B: the real upstream preparation for a USER_PAID generation action.
 *
 * Sequence (each step its own short transaction, each idempotent):
 *
 *   1. freeze the context bundle (Block A service),
 *   2. build + freeze the workflow plan bound to that bundle,
 *   3. issue the CreditQuote through the EXISTING M3 quote service, bound to
 *      the exact workflowPlanId / workflowPlanHash / bundleId / dependencyHash.
 *
 * No reservation and no job is created here: confirmation continues through
 * the existing M3 `confirmQuote` service (Task 6 semantics untouched).
 */

export interface PreparePaidGenerationInput {
  readonly projectId: string;
  readonly workflowKind: string;
  /** Caller-allocated stable ids (allocated before the freeze UoWs). */
  readonly bundleId: string;
  readonly planId: string;
  /** Bundle freeze input tail (packets built by the caller via core builders). */
  readonly bundle: Omit<FreezeBundleInput, 'projectId' | 'bundleId'>;
  /** Routing profile + price snapshots for the plan compile. */
  readonly profile: BuildWorkflowPlanInput['profile'];
  readonly priceSnapshots: BuildWorkflowPlanInput['priceSnapshots'];
  /** Existing M3 quote issuance input tail. */
  readonly userId: string;
  readonly actionKind: string;
  readonly issuanceRequestId: string;
}

export type PreparePaidGenerationResult =
  | {
      readonly kind: 'prepared';
      readonly bundle: FrozenBundle;
      readonly plan: FrozenWorkflowPlan;
      readonly planHash: string;
      readonly planRecordId: string;
      readonly quote: CreditQuoteRecord;
      readonly quoteReplay: false;
    }
  | { readonly kind: 'replayed'; readonly quote: CreditQuoteRecord }
  | {
      readonly kind: 'invalid';
      readonly errorCode:
        FreezeBundleErrorCode | BuildPlanErrorCode | 'bundle_not_found' | 'quote_not_issued';
    };

export function createPaidGenerationPreparationService(deps: { unitOfWork: UnitOfWork }) {
  const bundleFreeze = createContextBundleFreezeService({ unitOfWork: deps.unitOfWork });
  const planFreeze = createWorkflowPlanFreezeService({ unitOfWork: deps.unitOfWork });
  const quoteService = createCreditQuoteService(deps.unitOfWork);

  return {
    async prepare(input: PreparePaidGenerationInput): Promise<PreparePaidGenerationResult> {
      // Step 1: freeze the bundle (idempotent by bundleHash).
      const bundleResult = await bundleFreeze.freezeBundle({
        projectId: input.projectId,
        workflowKind: input.workflowKind,
        bundleId: input.bundleId,
        dependencyEntries: input.bundle.dependencyEntries,
        packets: input.bundle.packets,
      });
      if (bundleResult.kind === 'invalid') {
        return { kind: 'invalid', errorCode: bundleResult.errorCode };
      }
      const bundle = bundleResult.bundle;

      // Step 2: build + freeze the plan against the frozen bundle (idempotent
      // by planHash).
      const built = buildWorkflowPlan({
        projectId: input.projectId,
        workflowKind: input.workflowKind,
        profile: input.profile,
        priceSnapshots: input.priceSnapshots,
      });
      if (built.kind === 'invalid') {
        return { kind: 'invalid', errorCode: built.errorCode };
      }
      const plan = built.plan;
      const frozen = await planFreeze.freezePlan({
        planId: input.planId,
        projectId: input.projectId,
        bundleId: bundle.bundleId,
        dependencyHash: bundle.dependencyHash,
        bundleHash: bundle.bundleHash,
        plan,
      });
      if (frozen.kind === 'invalid') {
        return { kind: 'invalid', errorCode: frozen.errorCode };
      }

      // Step 3: the EXISTING M3 quote service issues the quote bound to the
      // exact frozen artifacts (its replay key is the issuance request id).
      const issued = await quoteService.issueQuote({
        userId: input.userId,
        projectId: input.projectId,
        actionKind: input.actionKind,
        workflowPlanId: frozen.record.id,
        workflowPlanHash: frozen.record.planHash,
        bundleId: bundle.bundleId,
        dependencyHash: bundle.dependencyHash,
        maxAmountMicroIdr: plan.estimatedMaxMicroIdr,
        issuanceRequestId: input.issuanceRequestId,
      });
      if (issued.kind !== 'issued') {
        return { kind: 'invalid', errorCode: 'quote_not_issued' };
      }

      return issued.isReplay
        ? { kind: 'replayed', quote: issued.quote }
        : {
            kind: 'prepared',
            bundle,
            plan,
            planHash: frozen.record.planHash,
            planRecordId: frozen.record.id,
            quote: issued.quote,
            quoteReplay: false,
          };
    },
  };
}
