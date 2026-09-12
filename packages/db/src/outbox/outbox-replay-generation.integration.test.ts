import {
  createOutboxDeliveryService,
  createOutboxHandlerRegistry,
  outboxIdempotencyKey,
  type OutboxDeliveryEvent,
  type OutboxHandler,
  type OutboxHandlerContext,
} from '@narraza/application';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import {
  CONSUMER,
  createDeliveryUnitOfWork,
  createPrismaForUrl,
  fetchReceipts,
  insertOutboxEvent,
  outboxEventIds,
} from './outbox-delivery-fixtures.js';

/**
 * W3.4 `outbox-replay-generation` (S8.4).
 *
 * A dead letter is revived by opening a NEW delivery generation over the SAME
 * immutable event. The event row is never rewritten and no second event is
 * appended, so the audit trail keeps one cause and N delivery attempts. The
 * idempotency key is derived from the event, not the generation, so a handler
 * that already applied the effect stays protected across replays.
 */

const schema = createSchemaTestSuite();
const EVENT_TYPE = 'generation_job.published';
const LEASE_MS = 60_000;

interface Recorder {
  handler: OutboxHandler;
  events: OutboxDeliveryEvent[];
  contexts: OutboxHandlerContext[];
}

function recordingHandler(outcomes: ('completed' | 'dead')[]): Recorder {
  const events: OutboxDeliveryEvent[] = [];
  const contexts: OutboxHandlerContext[] = [];
  const queue = [...outcomes];
  const handler: OutboxHandler = {
    consumerKey: CONSUMER,
    eventTypes: [EVENT_TYPE],
    handle: async (event, context) => {
      events.push(event);
      contexts.push(context);
      const next = queue.shift() ?? 'completed';
      return next === 'completed' ? { kind: 'completed' } : { kind: 'dead', errorCode: 'rejected' };
    },
  };
  return { handler, events, contexts };
}

schema.test('outbox-replay-generation', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, {
    id: outboxEventIds.first,
    schemaVersion: 3,
    payload: JSON.stringify({ evidence: 'replay-generation' }),
  });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const { handler, events, contexts } = recordingHandler(['dead', 'completed']);
    const service = createOutboxDeliveryService(
      createDeliveryUnitOfWork(prisma),
      createOutboxHandlerRegistry([handler]),
      { leaseMs: LEASE_MS },
    );
    const eventSnapshot = await client.query(
      `SELECT id, aggregate_type, aggregate_id, event_type, dedupe_key, schema_version,
              payload, occurred_at, created_at
         FROM outbox_events WHERE id = $1`,
      [outboxEventIds.first],
    );

    // Generation 0 dies.
    const first = await service.deliverOnce();
    expect(first).toMatchObject({
      kind: 'delivered',
      deliveryGeneration: 0,
      attemptCount: 1,
      terminal: 'dead',
      finalize: 'finalized',
    });
    const afterDead = await fetchReceipts(client, outboxEventIds.first);
    expect(afterDead).toHaveLength(1);
    expect(afterDead[0]).toMatchObject({
      delivery_generation: 0,
      status: 'dead',
      attempt_count: 1,
      lease_expires_at: null,
      completed_at: null,
      uncertain_at: null,
      last_error_code: 'rejected',
    });
    expect(afterDead[0]!.dead_at).toBeInstanceOf(Date);

    // Nothing redelivers a dead generation automatically.
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(events).toHaveLength(1);

    // Explicit replay opens generation 1 and completes through the SAME handler.
    const replayed = await service.replayDead({
      outboxEventId: outboxEventIds.first,
      consumerKey: CONSUMER,
    });
    expect(replayed).toMatchObject({
      kind: 'delivered',
      consumerKey: CONSUMER,
      eventId: outboxEventIds.first,
      deliveryGeneration: 1,
      attemptCount: 1,
      terminal: 'completed',
      finalize: 'finalized',
    });

    // The delivered event body is byte-for-byte the same across generations.
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual(events[0]);
    const key = outboxIdempotencyKey(CONSUMER, `job-published:${outboxEventIds.first}`);
    expect(contexts.map((context) => context.idempotencyKey)).toEqual([key, key]);
    expect(contexts.map((context) => context.deliveryGeneration)).toEqual([0, 1]);
    expect(contexts.map((context) => context.attemptCount)).toEqual([1, 1]);
    expect(events[1]).toMatchObject({
      eventId: outboxEventIds.first,
      dedupeKey: `job-published:${outboxEventIds.first}`,
      schemaVersion: 3,
      payload: { evidence: 'replay-generation' },
    });

    // Two receipt rows, one per generation; the dead row is preserved as history.
    const receipts = await fetchReceipts(client, outboxEventIds.first);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({
      delivery_generation: 0,
      status: 'dead',
      attempt_count: 1,
      last_error_code: 'rejected',
    });
    expect(receipts[1]).toMatchObject({
      delivery_generation: 1,
      status: 'completed',
      attempt_count: 1,
      lease_expires_at: null,
      uncertain_at: null,
      dead_at: null,
      last_error_code: null,
    });

    // The event row itself was never touched and no second event was appended.
    const eventsAfter = await client.query(
      `SELECT id, aggregate_type, aggregate_id, event_type, dedupe_key, schema_version,
              payload, occurred_at, created_at
         FROM outbox_events ORDER BY id`,
    );
    expect(eventsAfter.rows).toEqual(eventSnapshot.rows);

    // Replay is not available while the latest generation is completed.
    await expect(
      service.replayDead({ outboxEventId: outboxEventIds.first, consumerKey: CONSUMER }),
    ).resolves.toEqual({ kind: 'not_replayable', reason: 'latest_generation_completed' });
    expect(await fetchReceipts(client, outboxEventIds.first)).toEqual(receipts);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('outbox-replay-concurrency', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  const workerA = createPrismaForUrl(databaseUrl);
  const workerB = createPrismaForUrl(databaseUrl);

  try {
    const uowA = createDeliveryUnitOfWork(workerA);
    const uowB = createDeliveryUnitOfWork(workerB);
    const service = createOutboxDeliveryService(
      uowA,
      createOutboxHandlerRegistry([recordingHandler(['dead']).handler]),
      { leaseMs: LEASE_MS },
    );
    await service.deliverOnce();
    expect((await fetchReceipts(client, outboxEventIds.first))[0]).toMatchObject({
      status: 'dead',
    });

    const input = {
      outboxEventId: outboxEventIds.first,
      consumerKey: CONSUMER,
      leaseMs: LEASE_MS,
    };
    // Both operators press replay at once. The event-row lock serializes them;
    // the unique (event, consumer, generation) index is the second guard.
    const settled = await Promise.allSettled([
      uowA.execute((port) => port.replayDead(input)),
      uowB.execute((port) => port.replayDead(input)),
    ]);
    const replayed = settled.filter(
      (result) => result.status === 'fulfilled' && result.value.kind === 'replayed',
    );
    expect(replayed).toHaveLength(1);

    const receipts = await fetchReceipts(client, outboxEventIds.first);
    expect(receipts.map((row) => row.delivery_generation)).toEqual([0, 1]);
    expect(receipts[1]).toMatchObject({
      status: 'processing',
      attempt_count: 1,
      delivery_generation: 1,
    });

    // A generation that is still processing is not replayable.
    await expect(uowB.execute((port) => port.replayDead(input))).resolves.toEqual({
      kind: 'not_replayable',
      reason: 'latest_generation_processing',
    });
    expect(await fetchReceipts(client, outboxEventIds.first)).toEqual(receipts);

    // An event that has no receipt for this consumer cannot be replayed either.
    await insertOutboxEvent(client, { id: outboxEventIds.second, occurredOffsetMs: 1000 });
    await expect(
      uowB.execute((port) => port.replayDead({ ...input, outboxEventId: outboxEventIds.second })),
    ).resolves.toEqual({ kind: 'not_replayable', reason: 'receipt_not_found' });

    // Neither can an event id that does not exist at all.
    await expect(
      uowB.execute((port) =>
        port.replayDead({ ...input, outboxEventId: '80000000-0000-4000-8000-0000000000ff' }),
      ),
    ).resolves.toEqual({ kind: 'not_replayable', reason: 'receipt_not_found' });
  } finally {
    await workerA.$disconnect();
    await workerB.$disconnect();
  }
});
