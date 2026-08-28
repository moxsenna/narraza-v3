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
    const settled = await Promise.allSettled([
      uowA.execute((port) => port.claimNext(claimInput)),
      uowB.execute((port) => port.claimNext(claimInput)),
    ]);
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    const results = settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    const claims = results.filter((result) => result.kind === 'claimed');
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

schema.test('outbox-claim-mixed-order', async ({ client, databaseUrl }) => {
  // Oldest-first must hold ACROSS both eligibility kinds, not within each one
  // separately. If fresh work were considered first, a steady arrival rate
  // would starve an older delivery whose worker crashed — precisely the case
  // at-least-once recovery exists to cover.
  //
  // An even older event of an unregistered type sits in front of everything to
  // prove type scoping is applied before ordering, not after.
  await insertOutboxEvent(client, {
    id: outboxEventIds.fourth,
    occurredOffsetMs: 0,
    eventType: 'generation_job.failed',
  });
  await insertOutboxEvent(client, { id: outboxEventIds.first, occurredOffsetMs: 1000 });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const unitOfWork = createDeliveryUnitOfWork(prisma);
    const claimInput = { consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS };

    // The old event is claimed and then abandoned mid-flight.
    await expect(unitOfWork.execute((port) => port.claimNext(claimInput))).resolves.toMatchObject({
      kind: 'claimed',
      event: { eventId: outboxEventIds.first },
      receipt: { deliveryGeneration: 0, attemptCount: 1 },
    });
    await expireLease(client, outboxEventIds.first);

    // Newer work arrives after the crash.
    await insertOutboxEvent(client, { id: outboxEventIds.second, occurredOffsetMs: 2000 });

    // The expired older delivery outranks the newer fresh event.
    await expect(unitOfWork.execute((port) => port.claimNext(claimInput))).resolves.toMatchObject({
      kind: 'claimed',
      event: { eventId: outboxEventIds.first },
      receipt: { deliveryGeneration: 0, attemptCount: 2 },
    });
    expect(await fetchReceipts(client, outboxEventIds.second)).toHaveLength(0);

    // Only once the old delivery leaves the eligible set does the newer one run.
    await expect(
      unitOfWork.execute((port) =>
        port.complete({
          outboxEventId: outboxEventIds.first,
          consumerKey: CONSUMER,
          deliveryGeneration: 0,
          attemptCount: 2,
        }),
      ),
    ).resolves.toEqual({ kind: 'finalized' });
    await expect(unitOfWork.execute((port) => port.claimNext(claimInput))).resolves.toMatchObject({
      kind: 'claimed',
      event: { eventId: outboxEventIds.second },
      receipt: { deliveryGeneration: 0, attemptCount: 1 },
    });

    // Starvation proof: however many fresh events arrive, the expired older
    // delivery keeps winning until it is finalized.
    await expireLease(client, outboxEventIds.second);
    for (let index = 0; index < 5; index += 1) {
      await insertOutboxEvent(client, {
        id: `80000000-0000-4000-8000-00000000001${index}`,
        occurredOffsetMs: 3000 + index,
      });
      await expect(unitOfWork.execute((port) => port.claimNext(claimInput))).resolves.toMatchObject(
        {
          kind: 'claimed',
          event: { eventId: outboxEventIds.second },
          receipt: { deliveryGeneration: 0, attemptCount: index + 2 },
        },
      );
      await expireLease(client, outboxEventIds.second);
    }

    // The unregistered older event was never claimed at any point.
    expect(await fetchReceipts(client, outboxEventIds.fourth)).toHaveLength(0);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('outbox-claim-mixed-concurrency', async ({ client, databaseUrl }) => {
  // Mixed eligibility under contention: one expired reclaim candidate and one
  // fresh candidate, two workers, one claim each. `SKIP LOCKED` on the event
  // row is the mechanism; a unique-violation catch is not the algorithm.
  await insertOutboxEvent(client, { id: outboxEventIds.first, occurredOffsetMs: 1000 });
  await insertOutboxEvent(client, { id: outboxEventIds.second, occurredOffsetMs: 2000 });
  const workerA = createPrismaForUrl(databaseUrl);
  const workerB = createPrismaForUrl(databaseUrl);

  try {
    const uowA = createDeliveryUnitOfWork(workerA);
    const uowB = createDeliveryUnitOfWork(workerB);
    const claimInput = { consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS };

    // `first` becomes the expired reclaim candidate; `second` stays fresh.
    await uowA.execute((port) => port.claimNext(claimInput));
    await expireLease(client, outboxEventIds.first);

    const settled = await Promise.allSettled([
      uowA.execute((port) => port.claimNext(claimInput)),
      uowB.execute((port) => port.claimNext(claimInput)),
    ]);
    // No deadlock and no unexpected error: both transactions completed.
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);

    const claimed = settled.flatMap((result) =>
      result.status === 'fulfilled' && result.value.kind === 'claimed' ? [result.value] : [],
    );
    expect(claimed).toHaveLength(2);
    // Each worker owns a different event: no duplicate live ownership.
    expect(claimed.map((claim) => claim.event.eventId).sort()).toEqual(
      [outboxEventIds.first, outboxEventIds.second].sort(),
    );

    // The reclaim incremented exactly once, and the fresh claim opened at 1.
    const reclaim = claimed.find((claim) => claim.event.eventId === outboxEventIds.first)!;
    expect(reclaim.receipt).toMatchObject({ deliveryGeneration: 0, attemptCount: 2 });
    const fresh = claimed.find((claim) => claim.event.eventId === outboxEventIds.second)!;
    expect(fresh.receipt).toMatchObject({ deliveryGeneration: 0, attemptCount: 1 });

    // One receipt row per event: nothing was claimed twice.
    expect(await fetchReceipts(client, outboxEventIds.first)).toHaveLength(1);
    expect(await fetchReceipts(client, outboxEventIds.second)).toHaveLength(1);

    // With both leases live, the eligible set is empty for everyone.
    await expect(uowA.execute((port) => port.claimNext(claimInput))).resolves.toEqual({
      kind: 'none',
    });
    await expect(uowB.execute((port) => port.claimNext(claimInput))).resolves.toEqual({
      kind: 'none',
    });
  } finally {
    await workerA.$disconnect();
    await workerB.$disconnect();
  }
});

schema.test('outbox-claim-keyset-precision', async ({ client, databaseUrl }) => {
  // More candidates than one sweep, with microsecond timestamps that cannot be
  // represented losslessly by JavaScript Date. A separate transaction locks
  // the first full batch. The claimant must advance by the exact PostgreSQL
  // tuple and reach candidate 33 rather than spin on the rounded timestamp.
  await client.query(
    `INSERT INTO outbox_events
       (id, aggregate_type, aggregate_id, event_type, dedupe_key, occurred_at,
        schema_version, payload, created_at)
     SELECT '81000000-0000-4000-8000-' || lpad(n::text, 12, '0'),
            'generation_job',
            'keyset-' || n,
            $1,
            'keyset-' || n,
            TIMESTAMPTZ '2026-01-01 00:00:00+00' + n * INTERVAL '1 microsecond',
            1,
            '{}'::jsonb,
            now()
       FROM generate_series(1, 33) AS n`,
    [EVENT_TYPE],
  );
  const locker = await client.connect();
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    await locker.query('BEGIN');
    const locked = await locker.query(
      `SELECT id
         FROM outbox_events
        WHERE dedupe_key LIKE 'keyset-%'
        ORDER BY occurred_at ASC, id ASC
        LIMIT 32
        FOR UPDATE`,
    );
    expect(locked.rows).toHaveLength(32);

    const unitOfWork = createDeliveryUnitOfWork(prisma);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('claim did not advance beyond locked candidate batch')),
        5_000,
      );
    });
    const claim = await Promise.race([
      unitOfWork.execute((port) =>
        port.claimNext({ consumerKey: CONSUMER, eventTypes: [EVENT_TYPE], leaseMs: LEASE_MS }),
      ),
      timeout,
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    expect(claim).toMatchObject({
      kind: 'claimed',
      event: { eventId: '81000000-0000-4000-8000-000000000033' },
      receipt: { deliveryGeneration: 0, attemptCount: 1 },
    });
  } finally {
    await locker.query('ROLLBACK');
    locker.release();
    await prisma.$disconnect();
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
