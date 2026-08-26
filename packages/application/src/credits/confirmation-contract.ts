import type { JsonObject } from '../ports/types.js';
import type { GenerationJobRecord } from '../ports/types.js';
import type { CreditReservationRecord } from '../ports/types.js';

/**
 * Confirmation contract: input/output types for atomic quote confirmation.
 *
 * This module defines the domain surface for Task 6 credit confirmation.
 * It is NOT part of CreditBalancePort or any generic financial mutation API.
 */

export interface CreateConfirmationInput {
  readonly userId: string;
  readonly projectId: string;
  readonly quoteId: string;
  readonly confirmationRequestId: string;
  readonly expectedWorkflowPlanHash: string;
  readonly expectedDependencyHash: string;
  readonly reservationId: string;
  readonly jobId: string;
  readonly jobKind: string;
  readonly bundleId: string | null;
  readonly workflowPlanId: string | null;
  readonly payload: JsonObject;
}

export type ConfirmQuoteResult =
  | {
      readonly kind: 'confirmed';
      readonly reservation: CreditReservationRecord;
      readonly job: GenerationJobRecord;
    }
  | {
      readonly kind: 'exact_replay';
      readonly reservation: CreditReservationRecord;
      readonly job: GenerationJobRecord;
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'already_consumed' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'invalid_quote_amount'; readonly amount: bigint }
  | { readonly kind: 'hash_mismatch'; readonly field: 'workflowPlanHash' | 'dependencyHash' }
  | { readonly kind: 'insufficient_credit' }
  | {
      readonly kind: 'funding_model_violation';
      readonly reason: 'unknown_kind' | 'known_ineligible_kind';
    }
  | { readonly kind: 'conflict' };
