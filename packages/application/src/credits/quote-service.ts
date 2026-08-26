import type { CreditQuoteRecord } from '../ports/types.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { resolveFundingModel, type ActionFundingModel } from './action-funding-policy.js';

export interface IssueQuoteInput {
  readonly userId: string;
  readonly projectId: string;
  readonly actionKind: string;
  readonly workflowPlanId: string | null;
  readonly workflowPlanHash: string;
  readonly bundleId: string | null;
  readonly dependencyHash: string;
  readonly maxAmountMicroIdr: bigint;
  readonly issuanceRequestId: string;
}

export type IssueQuoteResult =
  | { readonly kind: 'issued'; readonly quote: CreditQuoteRecord; readonly isReplay: boolean }
  | { readonly kind: 'not_applicable'; readonly fundingModel: ActionFundingModel }
  | { readonly kind: 'funding_model_violation'; readonly reason: 'unknown_kind' }
  | { readonly kind: 'invalid_quote_amount'; readonly amount: bigint }
  | { readonly kind: 'invalid_hash'; readonly field: 'workflowPlanHash' | 'dependencyHash' }
  | { readonly kind: 'invalid_bundle_binding' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'conflict' };

export interface CreditQuoteService {
  issueQuote(input: IssueQuoteInput): Promise<IssueQuoteResult>;
}

const HEX_64_REGEX = /^[0-9a-f]{64}$/;

export function createCreditQuoteService(unitOfWork: UnitOfWork): CreditQuoteService {
  return {
    async issueQuote(input: IssueQuoteInput): Promise<IssueQuoteResult> {
      // Validation 1: Pure funding-model admission check (before UoW or any DB IO)
      let fundingModel: ActionFundingModel;
      try {
        fundingModel = resolveFundingModel(input.actionKind);
      } catch {
        return { kind: 'funding_model_violation', reason: 'unknown_kind' };
      }

      if (fundingModel !== 'user_paid') {
        return { kind: 'not_applicable', fundingModel };
      }

      // Validation 2: Amount must be strictly positive (> 0)
      if (input.maxAmountMicroIdr <= 0n) {
        return { kind: 'invalid_quote_amount', amount: input.maxAmountMicroIdr };
      }

      // Validation 3: Hashes must be lowercase 64-character hex strings
      if (!HEX_64_REGEX.test(input.workflowPlanHash)) {
        return { kind: 'invalid_hash', field: 'workflowPlanHash' };
      }
      if (!HEX_64_REGEX.test(input.dependencyHash)) {
        return { kind: 'invalid_hash', field: 'dependencyHash' };
      }

      // Validation 4: Bundle / WorkflowPlan coherence
      if (input.workflowPlanId !== null && input.bundleId === null) {
        return { kind: 'invalid_bundle_binding' };
      }
      if (input.workflowPlanId === null && input.bundleId !== null) {
        return { kind: 'invalid_bundle_binding' };
      }

      return unitOfWork.execute(async (ports) => {
        // Validation 5: Non-enumerating project ownership check
        const project = await ports.project.findByIdForOwner(input.projectId, input.userId);
        if (project === null || project.deletedAt !== null) {
          return { kind: 'not_found' };
        }

        const quoteId = ports.allocateId();
        const inserted = await ports.quote.insert({
          id: quoteId,
          userId: input.userId,
          projectId: input.projectId,
          workflowPlanId: input.workflowPlanId,
          workflowPlanHash: input.workflowPlanHash,
          bundleId: input.bundleId,
          dependencyHash: input.dependencyHash,
          maxAmountMicroIdr: input.maxAmountMicroIdr,
          requestId: input.issuanceRequestId,
        });

        switch (inserted.kind) {
          case 'inserted':
            return { kind: 'issued', quote: inserted.quote, isReplay: false };
          case 'replayed':
            return { kind: 'issued', quote: inserted.quote, isReplay: true };
          case 'invalid_bundle_binding':
            return { kind: 'invalid_bundle_binding' };
          case 'plan_not_found':
            return { kind: 'not_found' };
          case 'conflict':
            return { kind: 'conflict' };
        }
      });
    },
  };
}
