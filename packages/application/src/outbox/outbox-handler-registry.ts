import type { OutboxHandler } from './outbox-handler.js';

/**
 * Composition-time registry of outbox consumers.
 *
 * Rilis 1 has NO external production channel (D11), so the production registry
 * is intentionally EMPTY. A fake or no-op handler that consumes existing events
 * is forbidden: it would burn real receipts for deliveries that never happened.
 */
export interface OutboxHandlerRegistry {
  readonly handlers: readonly OutboxHandler[];
  get(consumerKey: string): OutboxHandler | undefined;
  readonly isEmpty: boolean;
}

export function createOutboxHandlerRegistry(
  handlers: readonly OutboxHandler[],
): OutboxHandlerRegistry {
  const byKey = new Map<string, OutboxHandler>();
  for (const handler of handlers) {
    if (handler.consumerKey.trim() === '') {
      throw new Error('outbox registry: consumerKey must be a non-empty string');
    }
    if (handler.eventTypes.length === 0) {
      throw new Error(
        `outbox registry: consumer "${handler.consumerKey}" must declare at least one event type`,
      );
    }
    if (byKey.has(handler.consumerKey)) {
      // Fail fast at startup: two handlers sharing a consumerKey would fight
      // over the same receipt rows.
      throw new Error(`outbox registry: duplicate consumerKey "${handler.consumerKey}"`);
    }
    byKey.set(handler.consumerKey, handler);
  }
  const frozen = [...handlers];
  return {
    handlers: frozen,
    get: (consumerKey) => byKey.get(consumerKey),
    isEmpty: frozen.length === 0,
  };
}

/**
 * Rilis 1 production registry. Stays empty until a real external channel
 * exists (D11); the first real handler is added here, not invented in a test.
 */
export function createProductionOutboxHandlerRegistry(): OutboxHandlerRegistry {
  return createOutboxHandlerRegistry([]);
}
