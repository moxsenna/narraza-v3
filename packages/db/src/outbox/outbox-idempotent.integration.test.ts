import {
  createOutboxDeliveryService,
  createOutboxHandlerRegistry,
  outboxIdempotencyKey,
  type OutboxHandler,
  type OutboxHandlerContext,
} from '@narraza/application';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import {
  CONSUMER,
  createDeliveryUnitOfWork,
  createPrismaForUrl,
  expireLease,
  fetchReceipts,
  insertOutboxEvent,
  outboxEventIds,
} from './outbox-delivery-fixtures.js';
import { createOutboxDeliveryPort } from '../repos/outbox-delivery-port.js';

/**
 * W3.4 `outbox-idempotent` (S8.4).
 *
 * Proves the at-least-once contract end to end against real PostgreSQL: a
 * worker that crashes AFTER performing the external side effect but BEFORE
 * finalizing its receipt must not produce a second side effect when the lease
 * expires and the same generation is reclaimed. Infrastructure guarantees a
 * stable idempotency key; the handler guarantees the effect happens once.
 */

const schema = createSchemaTestSuite();
const EVENT_TYPE = 'generation_job.published';
const LEASE_MS = 60_000;

/** Stands in for an external channel keyed by the delivery idempotency key. */
function sideEffectHandler(options: { crashOnAttempt?: number } = {}): {
  handler: OutboxHandler;
  effects: string[];
  contexts: OutboxHandlerContext[];
} {
  const effects: string[] = [];
  const contexts: OutboxHandlerContext[] = [];
  const handler: OutboxHandler = {
    consumerKey: CONSUMER,
    eventTypes: [EVENT_TYPE],
    handle: async (_event, context) => {
      contexts.push(context);
      // Real external systems dedupe on the key we hand them.
      if (!effects.includes(context.idempotencyKey)) effects.push(context.idempotencyKey);
      if (options.crashOnAttempt === context.attemptCount) {
        throw new Error('worker crashed after the side effect, before finalization');
      }
      return { kind: 'completed' };
    },
  };
  return { handler, effects, contexts };
}

schema.test('outbox-idempotent', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const { handler, effects, contexts } = sideEffectHandler({ crashOnAttempt: 1 });
    const unitOfWork = createDeliveryUnitOfWork(prisma);
    const service = createOutboxDeliveryService(
      unitOfWork,
      createOutboxHandlerRegistry([handler]),
      { leaseMs: LEASE_MS },
    );

    // 1. First attempt: claim commits, side effect lands, worker crashes.
    const first = await service.deliverOnce();
    expect(first).toMatchObject({
      kind: 'handler_error',
      consumerKey: CONSUMER,
      eventId: outboxEventIds.first,
      deliveryGeneration: 0,
      attemptCount: 1,
    });
    expect(effects).toHaveLength(1);

    // 2. The receipt is stranded in `processing` under a live lease. It is NOT
    //    classified dead or uncertain by the infrastructure.
    const afterCrash = await fetchReceipts(client, outboxEventIds.first);
    expect(afterCrash).toHaveLength(1);
    expect(afterCrash[0]).toMatchObject({
      delivery_generation: 0,
      status: 'processing',
      attempt_count: 1,
      completed_at: null,
      uncertain_at: null,
      dead_at: null,
      last_error_code: null,
    });
    expect(afterCrash[0]!.lease_expires_at).not.toBeNull();

    // 3. A live lease is not claimable by anyone, including this same worker.
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(effects).toHaveLength(1);

    // 4. Lease expiry (PostgreSQL clock) makes the SAME generation reclaimable.
    await expireLease(client, outboxEventIds.first);
    const second = await service.deliverOnce();
    expect(second).toMatchObject({
      kind: 'delivered',
      deliveryGeneration: 0,
      attemptCount: 2,
      terminal: 'completed',
      finalize: 'finalized',
    });

    // 5. Exactly one side effect across both attempts, under one stable key.
    expect(effects).toEqual([
      outboxIdempotencyKey(CONSUMER, `job-published:${outboxEventIds.first}`),
    ]);
    expect(contexts.map((context) => context.idempotencyKey)).toEqual([effects[0], effects[0]]);
    expect(contexts.map((context) => context.attemptCount)).toEqual([1, 2]);
    expect(contexts.every((context) => context.deliveryGeneration === 0)).toBe(true);

    // 6. Still ONE receipt row: a retry is a new attempt, never a new generation.
    const afterRetry = await fetchReceipts(client, outboxEventIds.first);
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]).toMatchObject({
      delivery_generation: 0,
      status: 'completed',
      attempt_count: 2,
      lease_expires_at: null,
      uncertain_at: null,
      dead_at: null,
      last_error_code: null,
    });
    expect(afterRetry[0]!.completed_at).toBeInstanceOf(Date);

    // 7. The superseded attempt-1 claimant cannot overwrite the attempt-2 result.
    const stale = await unitOfWork.execute((port) =>
      port.markDead({
        outboxEventId: outboxEventIds.first,
        consumerKey: CONSUMER,
        deliveryGeneration: 0,
        attemptCount: 1,
        errorCode: 'stale_claimant',
      }),
    );
    expect(stale).toEqual({ kind: 'stale' });
    expect(await fetchReceipts(client, outboxEventIds.first)).toEqual(afterRetry);

    // 8. A terminal generation is never redelivered.
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(effects).toHaveLength(1);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('outbox-claim-fence', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  const workerA = createPrismaForUrl(databaseUrl);
  const workerB = createPrismaForUrl(databaseUrl);

  try {
    const uowA = createDeliveryUnitOfWork(workerA);
    const uowB = createDeliveryUnitOfWork(workerB);
    const claimInput = { consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS };

    // Two workers race for one event. SKIP LOCKED plus the unique
    // (event, consumer, generation) index means exactly one wins.
    const [a, b] = await Promise.all([
      uowA.execute((port) => port.claimNext(claimInput)),
      uowB.execute((port) => port.claimNext(claimInput)).catch(() => ({ kind: 'none' }) as const),
    ]);
    const claims = [a, b].filter((result) => result.kind === 'claimed');
    expect(claims).toHaveLength(1);
    expect(await fetchReceipts(client, outboxEventIds.first)).toHaveLength(1);

    const winner = claims[0]!;
    if (winner.kind !== 'claimed') throw new Error('no claimant');
    expect(winner.receipt).toMatchObject({
      consumerKey: CONSUMER,
      deliveryGeneration: 0,
      attemptCount: 1,
    });

    // The loser cannot finalize an attempt it never owned.
    await expect(
      uowB.execute((port) =>
        port.complete({
          outboxEventId: outboxEventIds.first,
          consumerKey: CONSUMER,
          deliveryGeneration: 0,
          attemptCount: 2,
        }),
      ),
    ).resolves.toEqual({ kind: 'stale' });

    // Reclaim after expiry bumps the fence; the old fence goes stale forever.
    await expireLease(client, outboxEventIds.first);
    const reclaimed = await uowB.execute((port) => port.claimNext(claimInput));
    expect(reclaimed).toMatchObject({ kind: 'claimed', receipt: { attemptCount: 2 } });

    await expect(
      uowA.execute((port) =>
        port.complete({
          outboxEventId: outboxEventIds.first,
          consumerKey: CONSUMER,
          deliveryGeneration: 0,
          attemptCount: 1,
        }),
      ),
    ).resolves.toEqual({ kind: 'stale' });
    expect((await fetchReceipts(client, outboxEventIds.first))[0]).toMatchObject({
      status: 'processing',
      attempt_count: 2,
    });

    await expect(
      uowB.execute((port) =>
        port.complete({
          outboxEventId: outboxEventIds.first,
          consumerKey: CONSUMER,
          deliveryGeneration: 0,
          attemptCount: 2,
        }),
      ),
    ).resolves.toEqual({ kind: 'finalized' });
  } finally {
    await workerA.$disconnect();
    await workerB.$disconnect();
  }
});

schema.test('outbox-claim-selection', async ({ client, databaseUrl }) => {
  // Deterministic oldest-first selection, and event-type scoping.
  await insertOutboxEvent(client, { id: outboxEventIds.second, occurredOffsetMs: 2000 });
  await insertOutboxEvent(client, { id: outboxEventIds.first, occurredOffsetMs: 1000 });
  await insertOutboxEvent(client, {
    id: outboxEventIds.third,
    occurredOffsetMs: 0,
    eventType: 'generation_job.failed',
  });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const unitOfWork = createDeliveryUnitOfWork(prisma);
    const claimInput = { consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS };

    // The oldest event is `third`, but its type is not registered to this
    // consumer, so it is never claimed.
    const first = await unitOfWork.execute((port) => port.claimNext(claimInput));
    expect(first).toMatchObject({ kind: 'claimed', event: { eventId: outboxEventIds.first } });

    const second = await unitOfWork.execute((port) => port.claimNext(claimInput));
    expect(second).toMatchObject({ kind: 'claimed', event: { eventId: outboxEventIds.second } });

    const third = await unitOfWork.execute((port) => port.claimNext(claimInput));
    expect(third).toEqual({ kind: 'none' });
    expect(await fetchReceipts(client, outboxEventIds.third)).toHaveLength(0);

    // An empty event-type list claims nothing rather than everything.
    await expect(
      unitOfWork.execute((port) =>
        port.claimNext({ consumerKey: CONSUMER, eventTypes: [], leaseMs: LEASE_MS }),
      ),
    ).resolves.toEqual({ kind: 'none' });

    // A different consumer sees the same events independently: generation 0.
    const other = await unitOfWork.execute((port) =>
      port.claimNext({
        consumerKey: 'other-consumer',
        eventTypes: [EVENT_TYPE],
        leaseMs: LEASE_MS,
      }),
    );
    expect(other).toMatchObject({
      kind: 'claimed',
      event: { eventId: outboxEventIds.first },
      receipt: { deliveryGeneration: 0, attemptCount: 1 },
    });
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('outbox-finalize-guards', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const unitOfWork = createDeliveryUnitOfWork(prisma);
    await unitOfWork.execute((port) =>
      port.claimNext({ consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS }),
    );
    const fence = {
      outboxEventId: outboxEventIds.first,
      consumerKey: CONSUMER,
      deliveryGeneration: 0,
      attemptCount: 1,
    };

    // A blank error code would be useless to the W7.5 sweeper: reject it before
    // it can reach the row.
    await expect(
      unitOfWork.execute((port) => port.markUncertain({ ...fence, errorCode: '  ' })),
    ).rejects.toThrow(/errorCode must be a non-empty string/);
    await expect(
      unitOfWork.execute((port) => port.markDead({ ...fence, errorCode: '' })),
    ).rejects.toThrow(/errorCode must be a non-empty string/);
    expect((await fetchReceipts(client, outboxEventIds.first))[0]).toMatchObject({
      status: 'processing',
      last_error_code: null,
    });

    // A non-positive lease is a programming error, not a zero-length lease.
    await expect(
      unitOfWork.execute((port) =>
        port.claimNext({ consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: 0 }),
      ),
    ).rejects.toThrow(RangeError);

    // An expired lease also fences finalization: ownership already lapsed.
    await expireLease(client, outboxEventIds.first);
    await expect(unitOfWork.execute((port) => port.complete(fence))).resolves.toEqual({
      kind: 'stale',
    });

    // Direct adapter construction is exercised too, so the export surface used
    // by composition is the same one under test.
    await prisma.$transaction(async (tx) => {
      const port = createOutboxDeliveryPort(tx);
      await expect(
        port.claimNext({ consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS }),
      ).resolves.toMatchObject({ kind: 'claimed', receipt: { attemptCount: 2 } });
    });
  } finally {
    await prisma.$disconnect();
  }
});
