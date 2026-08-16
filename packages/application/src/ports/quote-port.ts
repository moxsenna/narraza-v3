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
}
