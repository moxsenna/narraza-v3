import type { JsonObject } from './types.js';

/**
 * Read/claim side of the outbox relay (S8.4, D11). Deliberately separate from
 * the write-side `OutboxPort`: producers only append, consumers only lease and
 * finalize. Keeping the two ports narrow prevents a use case that appends an
 * event from also being able to mark somebody else's delivery complete.
 *
 * Ratified state machine (W3.4):
 *   - first delivery of an event to a consumer is generation 0, attempt 1;
 *   - an expired `processing` lease is reclaimed on the SAME generation with
 *     `attemptCount + 1`;
 *   - `completed` / `uncertain` / `dead` are terminal for that generation;
 *   - only `dead` may be revived, via explicit `replayDead`, which opens
 *     generation `previous + 1` over the SAME immutable event.
 *
 * Every operational timestamp and lease-expiry comparison is evaluated by the
 * PostgreSQL clock inside the adapter; Node `Date` values never decide
 * ownership.
 */

/** Immutable event body as appended by the producer. Never rewritten on retry. */
export interface OutboxDeliveryEvent {
  readonly eventId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly dedupeKey: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly occurredAt: Date;
}

/** Receipt identity of one live attempt. Fences every finalization. */
export interface OutboxDeliveryReceipt {
  readonly consumerKey: string;
  readonly deliveryGeneration: number;
  readonly attemptCount: number;
  readonly leaseExpiresAt: Date;
}

/** A claimed unit of work: immutable event + the attempt that owns it. */
export interface OutboxClaim {
  readonly event: OutboxDeliveryEvent;
  readonly receipt: OutboxDeliveryReceipt;
}

export interface ClaimNextOutboxInput {
  /** Consumer requesting work. One registry entry per key. */
  readonly consumerKey: string;
  /** Only these event types are claimable by this consumer. */
  readonly eventTypes: readonly string[];
  /** Lease duration applied from the PostgreSQL clock at claim time. */
  readonly leaseMs: number;
}

export type ClaimNextOutboxResult =
  { readonly kind: 'none' } | ({ readonly kind: 'claimed' } & OutboxClaim);

/**
 * Fence for every finalization: the exact event, consumer, generation and
 * attempt that was handed out by `claimNext`. A stale claimant (an attempt that
 * has already been superseded by lease expiry) must mutate zero rows.
 */
export interface OutboxFinalizeFence {
  readonly outboxEventId: string;
  readonly consumerKey: string;
  readonly deliveryGeneration: number;
  readonly attemptCount: number;
}

export interface OutboxFailureFence extends OutboxFinalizeFence {
  /** Deterministic, non-empty classification recorded on the receipt. */
  readonly errorCode: string;
}

export type OutboxFinalizeResult =
  | { readonly kind: 'finalized' }
  /** The fence did not match a live `processing` attempt. Nothing was written. */
  | { readonly kind: 'stale' };

export interface ReplayDeadOutboxInput {
  readonly outboxEventId: string;
  readonly consumerKey: string;
  readonly leaseMs: number;
}

export type ReplayDeadOutboxResult =
  | ({ readonly kind: 'replayed' } & OutboxClaim)
  /** Latest generation is not `dead` (missing, processing, completed, uncertain). */
  | { readonly kind: 'not_replayable'; readonly reason: OutboxNotReplayableReason };

export type OutboxNotReplayableReason =
  | 'receipt_not_found'
  | 'latest_generation_processing'
  | 'latest_generation_completed'
  | 'latest_generation_uncertain';

export interface OutboxDeliveryPort {
  /**
   * Deterministic oldest-first claim (`occurred_at`, then `id`) restricted to
   * `eventTypes`, using `FOR UPDATE ... SKIP LOCKED` so parallel workers never
   * contend on the same row.
   */
  claimNext(input: ClaimNextOutboxInput): Promise<ClaimNextOutboxResult>;
  complete(fence: OutboxFinalizeFence): Promise<OutboxFinalizeResult>;
  markUncertain(fence: OutboxFailureFence): Promise<OutboxFinalizeResult>;
  markDead(fence: OutboxFailureFence): Promise<OutboxFinalizeResult>;
  /** Explicit operator/replay path. Opens generation `previous + 1`. */
  replayDead(input: ReplayDeadOutboxInput): Promise<ReplayDeadOutboxResult>;
}

/**
 * Least-privilege transaction scope for the outbox consumer (S6.3/D11): it
 * hands out the delivery port and nothing else, so consumer code cannot reach
 * the ledger, credit or job ports even when it runs inside the worker process.
 *
 * Each call is one short READ COMMITTED transaction. Handler execution happens
 * between two separate calls, never inside one.
 */
export interface OutboxDeliveryUnitOfWork {
  execute<T>(fn: (port: OutboxDeliveryPort) => Promise<T>): Promise<T>;
}
