import { describe, expect, it, vi } from 'vitest';
import type {
  ClaimNextOutboxInput,
  ClaimNextOutboxResult,
  OutboxDeliveryEvent,
  OutboxDeliveryPort,
  OutboxDeliveryUnitOfWork,
  OutboxFailureFence,
  OutboxFinalizeFence,
  OutboxFinalizeResult,
  ReplayDeadOutboxInput,
  ReplayDeadOutboxResult,
} from '../ports/outbox-delivery-port.js';
import { createOutboxDeliveryService } from './outbox-delivery-service.js';
import {
  createOutboxHandlerRegistry,
  createProductionOutboxHandlerRegistry,
} from './outbox-handler-registry.js';
import type { OutboxHandler, OutboxHandlerContext } from './outbox-handler.js';
import { outboxIdempotencyKey } from './outbox-handler.js';

const event: OutboxDeliveryEvent = {
  eventId: 'evt-1',
  aggregateType: 'job',
  aggregateId: 'job-1',
  eventType: 'job.completed',
  dedupeKey: 'job-1:completed',
  schemaVersion: 1,
  payload: { jobId: 'job-1' },
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
};

interface PortStub extends OutboxDeliveryPort {
  readonly calls: {
    claimNext: ClaimNextOutboxInput[];
    complete: OutboxFinalizeFence[];
    markUncertain: OutboxFailureFence[];
    markDead: OutboxFailureFence[];
    replayDead: ReplayDeadOutboxInput[];
  };
  /** How many separate transactions the service opened. */
  txCount(): number;
}

function stubPort(overrides: Partial<OutboxDeliveryPort> = {}): {
  port: PortStub;
  unitOfWork: OutboxDeliveryUnitOfWork;
} {
  const calls: PortStub['calls'] = {
    claimNext: [],
    complete: [],
    markUncertain: [],
    markDead: [],
    replayDead: [],
  };
  let transactions = 0;
  const finalized: OutboxFinalizeResult = { kind: 'finalized' };
  const port: PortStub = {
    calls,
    txCount: () => transactions,
    claimNext: async (input): Promise<ClaimNextOutboxResult> => {
      calls.claimNext.push(input);
      return overrides.claimNext ? await overrides.claimNext(input) : { kind: 'none' };
    },
    complete: async (fence) => {
      calls.complete.push(fence);
      return overrides.complete ? await overrides.complete(fence) : finalized;
    },
    markUncertain: async (fence) => {
      calls.markUncertain.push(fence);
      return overrides.markUncertain ? await overrides.markUncertain(fence) : finalized;
    },
    markDead: async (fence) => {
      calls.markDead.push(fence);
      return overrides.markDead ? await overrides.markDead(fence) : finalized;
    },
    replayDead: async (input): Promise<ReplayDeadOutboxResult> => {
      calls.replayDead.push(input);
      return overrides.replayDead
        ? await overrides.replayDead(input)
        : { kind: 'not_replayable', reason: 'receipt_not_found' };
    },
  };
  const unitOfWork: OutboxDeliveryUnitOfWork = {
    async execute(fn) {
      transactions += 1;
      return await fn(port);
    },
  };
  return { port, unitOfWork };
}

function claimed(
  overrides: { deliveryGeneration?: number; attemptCount?: number; consumerKey?: string } = {},
): ClaimNextOutboxResult {
  return {
    kind: 'claimed',
    event,
    receipt: {
      consumerKey: overrides.consumerKey ?? 'test-consumer',
      deliveryGeneration: overrides.deliveryGeneration ?? 0,
      attemptCount: overrides.attemptCount ?? 1,
      leaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
    },
  };
}

function handler(
  impl: OutboxHandler['handle'],
  overrides: Partial<Pick<OutboxHandler, 'consumerKey' | 'eventTypes'>> = {},
): OutboxHandler {
  return {
    consumerKey: overrides.consumerKey ?? 'test-consumer',
    eventTypes: overrides.eventTypes ?? ['job.completed'],
    handle: impl,
  };
}

const leaseMs = 60_000;

describe('outbox handler registry', () => {
  it('production registry is empty so no existing event is consumed', async () => {
    const registry = createProductionOutboxHandlerRegistry();
    expect(registry.isEmpty).toBe(true);
    expect(registry.handlers).toHaveLength(0);

    const { port, unitOfWork } = stubPort({ claimNext: async () => claimed() });
    const service = createOutboxDeliveryService(unitOfWork, registry, { leaseMs });
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(port.calls.claimNext).toHaveLength(0);
    expect(port.txCount()).toBe(0);
  });

  it('rejects duplicate consumerKey at composition time', () => {
    const first = handler(async () => ({ kind: 'completed' }));
    const second = handler(async () => ({ kind: 'completed' }), { eventTypes: ['job.failed'] });
    expect(() => createOutboxHandlerRegistry([first, second])).toThrow(
      /duplicate consumerKey "test-consumer"/,
    );
  });

  it('rejects a handler with no consumerKey or no event types', () => {
    expect(() =>
      createOutboxHandlerRegistry([
        handler(async () => ({ kind: 'completed' }), { consumerKey: ' ' }),
      ]),
    ).toThrow(/non-empty string/);
    expect(() =>
      createOutboxHandlerRegistry([
        handler(async () => ({ kind: 'completed' }), { eventTypes: [] }),
      ]),
    ).toThrow(/at least one event type/);
  });
});

describe('outbox delivery service', () => {
  it('claims only the event types the consumer registered', async () => {
    const { port, unitOfWork } = stubPort();
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'completed' }), { eventTypes: ['job.completed', 'job.failed'] }),
    ]);
    await createOutboxDeliveryService(unitOfWork, registry, { leaseMs }).deliverOnce();
    expect(port.calls.claimNext[0]).toEqual({
      consumerKey: 'test-consumer',
      eventTypes: ['job.completed', 'job.failed'],
      leaseMs,
    });
  });

  it('runs the handler outside the claim transaction and finalizes in a second one', async () => {
    let openDuringHandler: number | undefined;
    const seen: OutboxHandlerContext[] = [];
    const calls: string[] = [];
    const port: OutboxDeliveryPort = {
      claimNext: async () => {
        calls.push('claim');
        return claimed();
      },
      complete: async () => {
        calls.push('complete');
        return { kind: 'finalized' };
      },
      markUncertain: async () => ({ kind: 'finalized' }),
      markDead: async () => ({ kind: 'finalized' }),
      replayDead: async () => ({ kind: 'not_replayable', reason: 'receipt_not_found' }),
    };
    let open = 0;
    const unitOfWork: OutboxDeliveryUnitOfWork = {
      async execute(fn) {
        open += 1;
        calls.push('tx_begin');
        try {
          return await fn(port);
        } finally {
          open -= 1;
          calls.push('tx_commit');
        }
      },
    };
    const registry = createOutboxHandlerRegistry([
      handler(async (_event, context) => {
        openDuringHandler = open;
        seen.push(context);
        return { kind: 'completed' };
      }),
    ]);

    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).deliverOnce();

    expect(openDuringHandler).toBe(0);
    expect(calls).toEqual(['tx_begin', 'claim', 'tx_commit', 'tx_begin', 'complete', 'tx_commit']);
    expect(outcome).toEqual({
      kind: 'delivered',
      consumerKey: 'test-consumer',
      eventId: 'evt-1',
      deliveryGeneration: 0,
      attemptCount: 1,
      terminal: 'completed',
      finalize: 'finalized',
    });
    expect(seen[0]).toEqual({
      idempotencyKey: 'outbox:test-consumer:job-1:completed',
      consumerKey: 'test-consumer',
      deliveryGeneration: 0,
      attemptCount: 1,
    });
  });

  it('fences finalization with the exact claimed generation and attempt', async () => {
    const { port, unitOfWork } = stubPort({
      claimNext: async () => claimed({ deliveryGeneration: 2, attemptCount: 3 }),
    });
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'uncertain', errorCode: 'channel_timeout' })),
    ]);
    await createOutboxDeliveryService(unitOfWork, registry, { leaseMs }).deliverOnce();
    expect(port.calls.markUncertain[0]).toEqual({
      outboxEventId: 'evt-1',
      consumerKey: 'test-consumer',
      deliveryGeneration: 2,
      attemptCount: 3,
      errorCode: 'channel_timeout',
    });
  });

  it('reports a stale finalization without mutating anything else', async () => {
    const { unitOfWork } = stubPort({
      claimNext: async () => claimed(),
      complete: async () => ({ kind: 'stale' }),
    });
    const registry = createOutboxHandlerRegistry([handler(async () => ({ kind: 'completed' }))]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).deliverOnce();
    expect(outcome).toMatchObject({ kind: 'delivered', finalize: 'stale' });
  });

  it('routes dead results to markDead with the handler error code', async () => {
    const { port, unitOfWork } = stubPort({ claimNext: async () => claimed() });
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'dead', errorCode: 'permanent_reject' })),
    ]);
    await createOutboxDeliveryService(unitOfWork, registry, { leaseMs }).deliverOnce();
    expect(port.calls.markDead[0]).toMatchObject({ errorCode: 'permanent_reject' });
    expect(port.calls.complete).toHaveLength(0);
    expect(port.calls.markUncertain).toHaveLength(0);
  });

  it('a thrown handler leaves the receipt processing: no finalization at all', async () => {
    const failure = new Error('socket hang up');
    const { port, unitOfWork } = stubPort({ claimNext: async () => claimed() });
    const registry = createOutboxHandlerRegistry([handler(() => Promise.reject(failure))]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).deliverOnce();
    expect(outcome).toEqual({
      kind: 'handler_error',
      consumerKey: 'test-consumer',
      eventId: 'evt-1',
      deliveryGeneration: 0,
      attemptCount: 1,
      error: failure,
    });
    expect(port.calls.complete).toHaveLength(0);
    expect(port.calls.markUncertain).toHaveLength(0);
    expect(port.calls.markDead).toHaveLength(0);
  });

  it('rejects a failure classification with an empty errorCode instead of writing it', async () => {
    const { port, unitOfWork } = stubPort({ claimNext: async () => claimed() });
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'uncertain', errorCode: '   ' })),
    ]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).deliverOnce();
    expect(outcome.kind).toBe('handler_error');
    expect(port.calls.markUncertain).toHaveLength(0);
  });

  it('stops at the first consumer that has work', async () => {
    const secondHandle = vi.fn(async () => ({ kind: 'completed' }) as const);
    const { port, unitOfWork } = stubPort({ claimNext: async () => claimed() });
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'completed' }), { consumerKey: 'first' }),
      handler(secondHandle, { consumerKey: 'second' }),
    ]);
    await createOutboxDeliveryService(unitOfWork, registry, { leaseMs }).deliverOnce();
    expect(port.calls.claimNext.map((call) => call.consumerKey)).toEqual(['first']);
    expect(secondHandle).not.toHaveBeenCalled();
  });

  it('is idle when every registered consumer has nothing to claim', async () => {
    const { port, unitOfWork } = stubPort();
    const registry = createOutboxHandlerRegistry([
      handler(async () => ({ kind: 'completed' }), { consumerKey: 'first' }),
      handler(async () => ({ kind: 'completed' }), { consumerKey: 'second' }),
    ]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).deliverOnce();
    expect(outcome).toEqual({ kind: 'idle' });
    expect(port.calls.claimNext).toHaveLength(2);
  });

  it('rejects a non-positive lease', () => {
    const { unitOfWork } = stubPort();
    const registry = createProductionOutboxHandlerRegistry();
    expect(() => createOutboxDeliveryService(unitOfWork, registry, { leaseMs: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('outbox replay', () => {
  it('runs the same handler on the new generation with an unchanged idempotency key', async () => {
    const contexts: OutboxHandlerContext[] = [];
    const { port, unitOfWork } = stubPort({
      replayDead: async () => ({ ...claimed({ deliveryGeneration: 1 }), kind: 'replayed' }),
    });
    const registry = createOutboxHandlerRegistry([
      handler(async (_event, context) => {
        contexts.push(context);
        return { kind: 'completed' };
      }),
    ]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).replayDead({ outboxEventId: 'evt-1', consumerKey: 'test-consumer' });

    expect(outcome).toMatchObject({
      kind: 'delivered',
      deliveryGeneration: 1,
      attemptCount: 1,
      terminal: 'completed',
    });
    expect(contexts[0]?.idempotencyKey).toBe(
      outboxIdempotencyKey('test-consumer', event.dedupeKey),
    );
    expect(port.calls.complete[0]).toMatchObject({ deliveryGeneration: 1, attemptCount: 1 });
  });

  it('surfaces a typed not-replayable reason and never calls the handler', async () => {
    const handle = vi.fn(async () => ({ kind: 'completed' }) as const);
    const { port, unitOfWork } = stubPort({
      replayDead: async () => ({ kind: 'not_replayable', reason: 'latest_generation_completed' }),
    });
    const registry = createOutboxHandlerRegistry([handler(handle)]);
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).replayDead({ outboxEventId: 'evt-1', consumerKey: 'test-consumer' });
    expect(outcome).toEqual({ kind: 'not_replayable', reason: 'latest_generation_completed' });
    expect(handle).not.toHaveBeenCalled();
    expect(port.calls.complete).toHaveLength(0);
  });

  it('refuses to replay a consumer that is not registered', async () => {
    const { port, unitOfWork } = stubPort();
    const registry = createProductionOutboxHandlerRegistry();
    const outcome = await createOutboxDeliveryService(unitOfWork, registry, {
      leaseMs,
    }).replayDead({ outboxEventId: 'evt-1', consumerKey: 'ghost' });
    expect(outcome).toEqual({ kind: 'unknown_consumer', consumerKey: 'ghost' });
    expect(port.calls.replayDead).toHaveLength(0);
  });
});
