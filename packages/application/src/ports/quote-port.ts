import type { CreditQuoteRecord } from './types.js';

export interface QuoteInsertInput {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly workflowPlanId: string | null;
  readonly workflowPlanHash: string;
  readonly bundleId: string | null;
  readonly dependencyHash: string;
  readonly maxAmountMicroIdr: bigint;
  readonly requestId: string | null;
}

export type QuoteInsertResult =
  | { readonly kind: 'inserted'; readonly quote: CreditQuoteRecord }
  | { readonly kind: 'replayed'; readonly quote: CreditQuoteRecord }
  | { readonly kind: 'invalid_bundle_binding' }
  | { readonly kind: 'plan_not_found' }
  | { readonly kind: 'conflict' };

export interface QuotePort {
  insert(input: QuoteInsertInput): Promise<QuoteInsertResult>;
  findById(id: string): Promise<CreditQuoteRecord | null>;
  findByRequestId(userId: string, requestId: string): Promise<CreditQuoteRecord | null>;

  // Task 6: Confirmation lock - scoped FOR UPDATE on user_id, project_id, quote_id
  confirmLock(
    userId: string,
    projectId: string,
    quoteId: string,
  ): Promise<CreditQuoteRecord | null>;

  // Task 6: Consume quote CAS
  consumeQuote(
    quoteId: string,
    expectedWorkflowPlanHash: string,
    expectedDependencyHash: string,
  ): Promise<
    | { readonly kind: 'consumed'; readonly quote: CreditQuoteRecord }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'already_consumed' }
    | { readonly kind: 'expired' }
    | { readonly kind: 'hash_mismatch' }
  >;
}
