import type { JsonObject } from './types.js';

export interface OutboxAppendInput {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly dedupeKey: string;
  readonly occurredAt: Date;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface CreditOverageIncidentInput {
  readonly id: string;
  readonly reservationId: string;
  readonly allocationId: string;
  readonly intendedSettlementMicroIdr: bigint;
  readonly actualSettlementMicroIdr: bigint;
  readonly systemSubsidyMicroIdr: bigint;
  readonly dedupeKey: `incident:credit-overage:${string}:${string}`;
}

export type CreditOverageIncidentResult =
  { readonly kind: 'appended' } | { readonly kind: 'replayed' } | { readonly kind: 'conflict' };

export interface OutboxPort {
  append(input: OutboxAppendInput): Promise<void>;
  /** Optional only for backward-compatible legacy UnitOfWork test doubles. */
  appendCreditOverageIncident?(
    input: CreditOverageIncidentInput,
  ): Promise<CreditOverageIncidentResult>;
}
