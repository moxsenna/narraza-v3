import { describe, expect, it, vi } from 'vitest';
import { createOutboxConsumerLoop } from './outbox-consumer-loop.js';
import { createOutboxModule, outboxSettingsFromEnv } from './outbox-module.js';
import { createProductionOutboxHandlerRegistry } from './outbox-handler-registry.js';
import type { OutboxDeliveryOutcome } from './outbox-delivery-service.js';

const settings = { pollMs: 1000, idleBackoffMs: 5000, shutdownDrainMs: 30_000 };

function harness(outcomes: (OutboxDeliveryOutcome | Error)[]) {
  const scheduled: { callback: () => void; ms: number }[] = [];
  const cancelled: number[] = [];
  let queue = [...outcomes];
  const deliverOnce = vi.fn(async (): Promise<OutboxDeliveryOutcome> => {
    const next = queue.shift() ?? { kind: 'idle' };
    if (next instanceof Error) throw next;
    return next;
  });
  const logger = { info: vi.fn(), error: vi.fn() };
  const disconnect = vi.fn(async () => undefined);
  const loop = createOutboxConsumerLoop({
    service: { deliverOnce },
    settings,
    schedule: (callback, ms) => {
      scheduled.push({ callback, ms });
      return (scheduled.length - 1) as unknown as ReturnType<typeof setTimeout>;
    },
    cancelTimer: (timer) => cancelled.push(timer as unknown as number),
    disconnect,
    logger,
  });
  return {
    loop,
    scheduled,
    cancelled,
    deliverOnce,
    logger,
    disconnect,
    delays: () => scheduled.map((entry) => entry.ms),
    enqueue: (next: OutboxDeliveryOutcome[]) => {
      queue = [...next];
    },
  };
}

const delivered = (terminal: 'completed' | 'uncertain' | 'dead'): OutboxDeliveryOutcome => ({
  kind: 'delivered',
  consumerKey: 'test-consumer',
  eventId: 'evt-1',
  deliveryGeneration: 0,
  attemptCount: 1,
  terminal,
  finalize: 'finalized',
});

describe('outbox consumer loop', () => {
  it('backs off 5s when idle and polls 1s after doing work (D12)', async () => {
    const h = harness([{ kind: 'idle' }, delivered('completed'), { kind: 'idle' }]);
    await h.loop.runOnce();
    await h.loop.runOnce();
    await h.loop.runOnce();
    expect(h.delays()).toEqual([5000, 1000, 5000]);
  });

  it('with an empty production registry it idles instead of busy-looping', async () => {
    const scheduled: number[] = [];
    const module = createOutboxModule({
      unitOfWork: {
        execute: async (fn) =>
          fn({
            claimNext: async () => ({ kind: 'none' }),
            complete: async () => ({ kind: 'finalized' }),
            markUncertain: async () => ({ kind: 'finalized' }),
            markDead: async () => ({ kind: 'finalized' }),
            replayDead: async () => ({ kind: 'not_replayable', reason: 'receipt_not_found' }),
          }),
      },
      registry: createProductionOutboxHandlerRegistry(),
      settings: outboxSettingsFromEnv({
        OUTBOX_POLL_MS: 1000,
        OUTBOX_IDLE_BACKOFF_MS: 5000,
        OUTBOX_LEASE_SECONDS: 60,
        OUTBOX_SHUTDOWN_DRAIN_MS: 30_000,
      }),
      schedule: (_callback, ms) => {
        scheduled.push(ms);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      cancelTimer: () => undefined,
      disconnect: async () => undefined,
      logger: { info: vi.fn(), error: vi.fn() },
    });
    await module.runOnce();
    expect(scheduled).toEqual([5000]);
  });

  it('maps lease seconds to milliseconds exactly once', () => {
    expect(
      outboxSettingsFromEnv({
        OUTBOX_POLL_MS: 1000,
        OUTBOX_IDLE_BACKOFF_MS: 5000,
        OUTBOX_LEASE_SECONDS: 60,
        OUTBOX_SHUTDOWN_DRAIN_MS: 30_000,
      }),
    ).toEqual({ pollMs: 1000, idleBackoffMs: 5000, leaseMs: 60_000, shutdownDrainMs: 30_000 });
  });

  it('logs handler errors at error level and keeps scheduling', async () => {
    const error = new Error('socket hang up');
    const h = harness([
      {
        kind: 'handler_error',
        consumerKey: 'test-consumer',
        eventId: 'evt-1',
        deliveryGeneration: 0,
        attemptCount: 1,
        error,
      },
    ]);
    await h.loop.runOnce();
    expect(h.logger.error).toHaveBeenCalledWith({
      event: 'outbox_handler_error',
      consumer_key: 'test-consumer',
      outbox_event_id: 'evt-1',
      delivery_generation: 0,
      attempt_count: 1,
      error,
    });
    expect(h.delays()).toEqual([1000]);
  });

  it('logs a terminal delivery at info level', async () => {
    const h = harness([delivered('uncertain')]);
    await h.loop.runOnce();
    expect(h.logger.info).toHaveBeenCalledWith({
      event: 'outbox_delivery',
      consumer_key: 'test-consumer',
      outbox_event_id: 'evt-1',
      delivery_generation: 0,
      attempt_count: 1,
      terminal: 'uncertain',
      finalize: 'finalized',
    });
  });

  it('survives an infrastructure throw and reschedules at the idle backoff', async () => {
    const h = harness([new Error('connection refused')]);
    await h.loop.runOnce();
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'outbox_loop_error' }),
    );
    expect(h.delays()).toEqual([5000]);
  });

  it('single-flight: a concurrent runOnce joins the in-flight iteration', async () => {
    const h = harness([{ kind: 'idle' }, { kind: 'idle' }]);
    const first = h.loop.runOnce();
    const second = h.loop.runOnce();
    await Promise.all([first, second]);
    expect(h.deliverOnce).toHaveBeenCalledOnce();
  });

  it('shutdown drains the in-flight delivery, cancels the timer and disconnects', async () => {
    let release: (() => void) | undefined;
    const deliverOnce = vi.fn(
      async (): Promise<OutboxDeliveryOutcome> =>
        new Promise((resolve) => {
          release = () => resolve(delivered('completed'));
        }),
    );
    const scheduled: (() => void)[] = [];
    const cancelled: number[] = [];
    const disconnect = vi.fn(async () => undefined);
    const logger = { info: vi.fn(), error: vi.fn() };
    const loop = createOutboxConsumerLoop({
      service: { deliverOnce },
      settings,
      schedule: (callback, ms) => {
        // Deadline timers must not resolve before the in-flight work does.
        if (ms === settings.shutdownDrainMs) return -1 as unknown as ReturnType<typeof setTimeout>;
        scheduled.push(callback);
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancelTimer: (timer) => cancelled.push(timer as unknown as number),
      disconnect,
      logger,
      now: () => 0,
    });

    const inFlight = loop.runOnce();
    const shutdown = loop.shutdown();
    release?.();
    await inFlight;
    await shutdown;

    expect(disconnect).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith({ event: 'outbox_consumer_shutdown' });
    // No further iteration was queued after stopping.
    expect(scheduled).toHaveLength(0);
  });

  it('after shutdown no further iteration runs', async () => {
    const h = harness([{ kind: 'idle' }]);
    await h.loop.shutdown();
    await h.loop.runOnce();
    expect(h.deliverOnce).not.toHaveBeenCalled();
    expect(h.disconnect).toHaveBeenCalledOnce();
  });

  it('shutdown is idempotent across repeated signals', async () => {
    const h = harness([]);
    await Promise.all([h.loop.shutdown(), h.loop.shutdown()]);
    expect(h.disconnect).toHaveBeenCalledOnce();
  });

  it('start logs the frozen cadence and kicks the first iteration', async () => {
    const h = harness([{ kind: 'idle' }]);
    h.loop.start();
    await h.loop.runOnce();
    expect(h.logger.info).toHaveBeenCalledWith({
      event: 'outbox_consumer_startup',
      poll_ms: 1000,
      idle_backoff_ms: 5000,
    });
    expect(h.deliverOnce).toHaveBeenCalledOnce();
  });
});
