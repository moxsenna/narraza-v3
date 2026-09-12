import type { OutboxDeliveryEvent } from '../ports/outbox-delivery-port.js';

/**
 * Handler contract for the outbox relay (S8.4).
 *
 * Delivery is at-least-once: the infrastructure may invoke the same handler
 * more than once for the same event, and it does NOT pretend to make external
 * side effects idempotent. Every real handler must key its side effect on
 * `context.idempotencyKey`, which is stable across attempts AND across replay
 * generations.
 */

export interface OutboxHandlerContext {
  /** `outbox:${consumerKey}:${event.dedupeKey}` — invariant for this event. */
  readonly idempotencyKey: string;
  readonly consumerKey: string;
  readonly deliveryGeneration: number;
  readonly attemptCount: number;
}

/**
 * Handlers classify their own outcome explicitly. An unhandled exception is
 * NOT silently mapped to `dead` or `uncertain`: it leaves the receipt in
 * `processing` so the lease can expire and the same generation be reclaimed.
 */
export type OutboxHandlerResult =
  | { readonly kind: 'completed' }
  | { readonly kind: 'uncertain'; readonly errorCode: string }
  | { readonly kind: 'dead'; readonly errorCode: string };

export interface OutboxHandler {
  readonly consumerKey: string;
  /** Only events of these types are claimable by this consumer. */
  readonly eventTypes: readonly string[];
  handle(event: OutboxDeliveryEvent, context: OutboxHandlerContext): Promise<OutboxHandlerResult>;
}

export function outboxIdempotencyKey(consumerKey: string, dedupeKey: string): string {
  return `outbox:${consumerKey}:${dedupeKey}`;
}
