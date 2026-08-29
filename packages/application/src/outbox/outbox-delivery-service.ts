import type {
  OutboxClaim,
  OutboxDeliveryUnitOfWork,
  OutboxFinalizeResult,
  OutboxNotReplayableReason,
} from '../ports/outbox-delivery-port.js';
import type { OutboxHandler, OutboxHandlerResult } from './outbox-handler.js';
import { outboxIdempotencyKey } from './outbox-handler.js';
import type { OutboxHandlerRegistry } from './outbox-handler-registry.js';

/**
 * Outbox delivery service (S8.4 / D11).
 *
 * Every delivery is exactly three phases and the handler NEVER runs inside a
 * database transaction:
 *
 *   Tx claim  -> COMMIT -> handler(event, context) -> Tx finalize -> COMMIT
 *
 * Holding a transaction open across an external call would pin a connection for
 * the whole network round trip and would make a crash indistinguishable from a
 * rollback. Committing the claim first is what makes the lease meaningful: the
 * row is visibly `processing` to every other worker while the side effect runs.
 */

export type OutboxTerminalKind = 'completed' | 'uncertain' | 'dead';

export type OutboxDeliveryOutcome =
  /** Registry empty, or no consumer had claimable work. */
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'delivered';
      readonly consumerKey: string;
      readonly eventId: string;
      readonly deliveryGeneration: number;
      readonly attemptCount: number;
      readonly terminal: OutboxTerminalKind;
      /** `stale` means the lease was lost mid-flight; nothing was written. */
      readonly finalize: OutboxFinalizeResult['kind'];
    }
  | {
      /**
       * Handler threw, or violated its contract. The receipt stays
       * `processing`; the lease expires and the SAME generation is reclaimed
       * with an incremented attempt.
       */
      readonly kind: 'handler_error';
      readonly consumerKey: string;
      readonly eventId: string;
      readonly deliveryGeneration: number;
      readonly attemptCount: number;
      readonly error: unknown;
    };

export type OutboxReplayOutcome =
  | OutboxDeliveryOutcome
  | { readonly kind: 'not_replayable'; readonly reason: OutboxNotReplayableReason }
  | { readonly kind: 'unknown_consumer'; readonly consumerKey: string };

export interface OutboxDeliveryServiceSettings {
  /** Lease duration handed to the adapter, applied from the PostgreSQL clock. */
  readonly leaseMs: number;
}

export interface OutboxDeliveryService {
  /**
   * Attempt one delivery across the registry, in registration order. Returns
   * after the first consumer that claims work, so a busy consumer cannot starve
   * the loop's shutdown check.
   */
  deliverOnce(): Promise<OutboxDeliveryOutcome>;
  /** Explicit dead-letter replay: opens generation `previous + 1`. */
  replayDead(input: { outboxEventId: string; consumerKey: string }): Promise<OutboxReplayOutcome>;
}

export function createOutboxDeliveryService(
  unitOfWork: OutboxDeliveryUnitOfWork,
  registry: OutboxHandlerRegistry,
  settings: OutboxDeliveryServiceSettings,
): OutboxDeliveryService {
  if (!Number.isSafeInteger(settings.leaseMs) || settings.leaseMs <= 0) {
    throw new RangeError('leaseMs must be a positive safe integer');
  }

  const runHandler = async (
    handler: OutboxHandler,
    claim: OutboxClaim,
  ): Promise<OutboxDeliveryOutcome> => {
    const { event, receipt } = claim;
    const identity = {
      consumerKey: receipt.consumerKey,
      eventId: event.eventId,
      deliveryGeneration: receipt.deliveryGeneration,
      attemptCount: receipt.attemptCount,
    } as const;

    let result: OutboxHandlerResult;
    try {
      // Outside the transaction, by contract.
      result = await handler.handle(event, {
        idempotencyKey: outboxIdempotencyKey(receipt.consumerKey, event.dedupeKey),
        consumerKey: receipt.consumerKey,
        deliveryGeneration: receipt.deliveryGeneration,
        attemptCount: receipt.attemptCount,
      });
    } catch (error) {
      return { kind: 'handler_error', ...identity, error };
    }

    const contractError = handlerResultViolation(result);
    if (contractError) {
      return { kind: 'handler_error', ...identity, error: contractError };
    }

    const fence = {
      outboxEventId: event.eventId,
      consumerKey: receipt.consumerKey,
      deliveryGeneration: receipt.deliveryGeneration,
      attemptCount: receipt.attemptCount,
    } as const;

    const finalize = await unitOfWork.execute(async (port) => {
      if (result.kind === 'completed') return port.complete(fence);
      if (result.kind === 'uncertain') {
        return port.markUncertain({ ...fence, errorCode: result.errorCode });
      }
      return port.markDead({ ...fence, errorCode: result.errorCode });
    });

    return { kind: 'delivered', ...identity, terminal: result.kind, finalize: finalize.kind };
  };

  return {
    async deliverOnce(): Promise<OutboxDeliveryOutcome> {
      for (const handler of registry.handlers) {
        const claimed = await unitOfWork.execute((port) =>
          port.claimNext({
            consumerKey: handler.consumerKey,
            eventTypes: handler.eventTypes,
            leaseMs: settings.leaseMs,
          }),
        );
        if (claimed.kind === 'none') continue;
        return await runHandler(handler, claimed);
      }
      return { kind: 'idle' };
    },

    async replayDead(input): Promise<OutboxReplayOutcome> {
      const handler = registry.get(input.consumerKey);
      if (!handler) return { kind: 'unknown_consumer', consumerKey: input.consumerKey };
      const replayed = await unitOfWork.execute((port) =>
        port.replayDead({
          outboxEventId: input.outboxEventId,
          consumerKey: input.consumerKey,
          leaseMs: settings.leaseMs,
        }),
      );
      if (replayed.kind === 'not_replayable') {
        return { kind: 'not_replayable', reason: replayed.reason };
      }
      return await runHandler(handler, replayed);
    },
  };
}

/**
 * A failure classification without a deterministic code is unusable for the
 * W7.5 alert sweeper, so it is treated as a handler contract violation rather
 * than written to the receipt.
 */
function handlerResultViolation(result: OutboxHandlerResult): Error | undefined {
  if (result.kind === 'completed') return undefined;
  if (typeof result.errorCode !== 'string' || result.errorCode.trim() === '') {
    return new Error(`outbox handler returned "${result.kind}" without a non-empty errorCode`);
  }
  return undefined;
}
