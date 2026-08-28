import type { OutboxDeliveryOutcome, OutboxDeliveryService } from './outbox-delivery-service.js';

/**
 * Outbox consumer loop (D11/D12).
 *
 * Lives in the application layer, not in an app, because BOTH deployment
 * shapes must run the identical state machine: the embedded module inside
 * worker-gen (Rilis 1) and the standalone `apps/worker-outbox` entrypoint used
 * once an external channel justifies its own process. Copying the loop into two
 * apps would let them drift.
 *
 * Timing (D12): poll 1s after doing work, idle backoff 5s after finding none.
 * With an empty handler registry the loop settles on the idle backoff instead
 * of spinning.
 */

type Timer = ReturnType<typeof setTimeout>;

export interface OutboxConsumerLoopSettings {
  /** Delay before the next attempt when the previous one did work. */
  readonly pollMs: number;
  /** Delay before the next attempt when there was nothing to claim. */
  readonly idleBackoffMs: number;
  /** Budget for draining an in-flight delivery on SIGTERM/SIGINT. */
  readonly shutdownDrainMs: number;
}

export interface OutboxConsumerLoopDependencies {
  readonly service: Pick<OutboxDeliveryService, 'deliverOnce'>;
  readonly settings: OutboxConsumerLoopSettings;
  readonly schedule: (callback: () => void, ms: number) => Timer;
  readonly cancelTimer: (timer: Timer) => void;
  readonly disconnect: () => Promise<void>;
  readonly logger: { info: (value: object) => void; error: (value: object) => void };
  readonly now?: () => number;
}

export interface OutboxConsumerLoop {
  start(): void;
  /** Single iteration; exposed so tests drive the loop deterministically. */
  runOnce(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createOutboxConsumerLoop(deps: OutboxConsumerLoopDependencies): OutboxConsumerLoop {
  const now = deps.now ?? (() => Date.now());
  let stopping = false;
  let running: Promise<void> | undefined;
  let timer: Timer | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const logOutcome = (outcome: OutboxDeliveryOutcome): void => {
    if (outcome.kind === 'idle') return;
    if (outcome.kind === 'handler_error') {
      // Infrastructure-level record only. The receipt stays `processing` so the
      // lease expires and the SAME generation is reclaimed with a higher
      // attempt; it is deliberately NOT classified as dead or uncertain.
      deps.logger.error({
        event: 'outbox_handler_error',
        consumer_key: outcome.consumerKey,
        outbox_event_id: outcome.eventId,
        delivery_generation: outcome.deliveryGeneration,
        attempt_count: outcome.attemptCount,
        error: outcome.error,
      });
      return;
    }
    deps.logger.info({
      event: 'outbox_delivery',
      consumer_key: outcome.consumerKey,
      outbox_event_id: outcome.eventId,
      delivery_generation: outcome.deliveryGeneration,
      attempt_count: outcome.attemptCount,
      terminal: outcome.terminal,
      finalize: outcome.finalize,
    });
  };

  const runOnce = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      if (stopping) return;
      let nextDelayMs = deps.settings.idleBackoffMs;
      try {
        const outcome = await deps.service.deliverOnce();
        logOutcome(outcome);
        // Found work: come back promptly so a burst drains at poll cadence.
        if (outcome.kind !== 'idle') nextDelayMs = deps.settings.pollMs;
      } catch (error) {
        deps.logger.error({ event: 'outbox_loop_error', error });
      } finally {
        if (!stopping) timer = deps.schedule(() => void runOnce(), nextDelayMs);
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };

  return {
    start(): void {
      deps.logger.info({
        event: 'outbox_consumer_startup',
        poll_ms: deps.settings.pollMs,
        idle_backoff_ms: deps.settings.idleBackoffMs,
      });
      void runOnce();
    },
    runOnce,
    shutdown(): Promise<void> {
      if (shutdownPromise) return shutdownPromise;
      const deadline = now() + deps.settings.shutdownDrainMs;
      shutdownPromise = (async () => {
        stopping = true;
        if (timer) deps.cancelTimer(timer);
        const inFlight = running;
        if (inFlight) {
          // A committed claim is already visible as `processing`; if the drain
          // budget runs out we simply let the lease expire rather than
          // abandoning the row in an unrecoverable state.
          await waitUntil(inFlight, deadline, deps).catch(() => undefined);
        }
        await deps.disconnect().catch((error: unknown) => {
          deps.logger.error({ event: 'outbox_disconnect_error', error });
        });
        deps.logger.info({ event: 'outbox_consumer_shutdown' });
      })();
      return shutdownPromise;
    },
  };
}

async function waitUntil(
  operation: Promise<void>,
  deadline: number,
  deps: OutboxConsumerLoopDependencies,
): Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const remaining = Math.max(0, deadline - now());
  if (remaining === 0) return;
  let deadlineTimer: Timer | undefined;
  const observed = operation.then(
    () => undefined,
    (error: unknown) => Promise.reject(error),
  );
  const timeout = new Promise<void>((resolve) => {
    deadlineTimer = deps.schedule(() => resolve(), remaining);
  });
  try {
    await Promise.race([observed, timeout]);
  } finally {
    if (deadlineTimer) deps.cancelTimer(deadlineTimer);
    // DB calls cannot be cancelled; keep the rejection observed after the
    // PM2 hard deadline detaches us.
    void observed.catch(() => undefined);
  }
}
