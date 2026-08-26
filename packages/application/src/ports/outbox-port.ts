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

export type ReservationReconciliationIncidentReason =
  'allocation_conflict' | 'settlement_conflict' | 'release_conflict' | 'reservation_conflict';

export interface ReservationReconciliationIncidentInput {
  readonly id: string;
  readonly reservationId: string;
  readonly jobId: string;
  readonly reason: ReservationReconciliationIncidentReason;
  readonly allocationId: string | null;
  readonly dedupeKey: `incident:reservation-reconciliation:${string}:${string}:${ReservationReconciliationIncidentReason}:${string}`;
}

export type ReservationReconciliationIncidentResult =
  { readonly kind: 'appended' } | { readonly kind: 'replayed' } | { readonly kind: 'conflict' };

/** Funding models that require a reservation binding; a terminal job without one is a corrupt state. */
export type MissingJobReservationFundingModel = 'user_paid' | 'system_funded';

/**
 * Durable incident for a terminal job whose funding model requires a reservation
 * but whose `reservationId` is null. Stable identity: one incident per corrupt
 * job (`incident:job-missing-reservation:{jobId}`); lease tokens, fence versions,
 * paths, and timestamps are excluded from semantic identity.
 */
export interface MissingJobReservationIncidentInput {
  readonly id: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly jobKind: string;
  readonly fundingModel: MissingJobReservationFundingModel;
  readonly dedupeKey: `incident:job-missing-reservation:${string}`;
}

export type MissingJobReservationIncidentResult =
  { readonly kind: 'appended' } | { readonly kind: 'replayed' } | { readonly kind: 'conflict' };

export interface OutboxPort {
  append(input: OutboxAppendInput): Promise<void>;
  /** Optional only for backward-compatible legacy UnitOfWork test doubles. */
  appendCreditOverageIncident?(
    input: CreditOverageIncidentInput,
  ): Promise<CreditOverageIncidentResult>;
  /** Optional only for backward-compatible legacy UnitOfWork test doubles. */
  appendReservationReconciliationIncident?(
    input: ReservationReconciliationIncidentInput,
  ): Promise<ReservationReconciliationIncidentResult>;
  /** Optional only for backward-compatible legacy UnitOfWork test doubles. */
  appendMissingJobReservationIncident?(
    input: MissingJobReservationIncidentInput,
  ): Promise<MissingJobReservationIncidentResult>;
}
