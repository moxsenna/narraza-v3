import {
  createOutboxDeliveryService,
  createOutboxHandlerRegistry,
  type OutboxHandler,
} from '@narraza/application';
import { expect } from 'vitest';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import {
  CONSUMER,
  createDeliveryUnitOfWork,
  createPrismaForUrl,
  databaseNow,
  fetchReceipts,
  insertOutboxEvent,
  outboxEventIds,
} from './outbox-delivery-fixtures.js';

/**
 * W3.4 `outbox-uncertain-delivery` (S8.4).
 *
 * `uncertain` is the honest answer when a side effect MAY have landed: the
 * transport failed after the request left. Redelivering could duplicate a real
 * external effect, so the generation is terminal and a human decides. Nothing
 * ages an uncertain receipt into `dead` automatically — the W7.5 sweeper only
 * alerts on it, which is out of W3.4 scope.
 */

const schema = createSchemaTestSuite();
const EVENT_TYPE = 'generation_job.published';
const LEASE_MS = 60_000;
const ERROR_CODE = 'channel_timeout';

function uncertainHandler(calls: number[]): OutboxHandler {
  return {
    consumerKey: CONSUMER,
    eventTypes: [EVENT_TYPE],
    handle: async (_event, context) => {
      calls.push(context.attemptCount);
      return { kind: 'uncertain', errorCode: ERROR_CODE };
    },
  };
}

schema.test('outbox-uncertain-delivery', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const calls: number[] = [];
    const before = await databaseNow(client);
    const unitOfWork = createDeliveryUnitOfWork(prisma);
    const service = createOutboxDeliveryService(
      unitOfWork,
      createOutboxHandlerRegistry([uncertainHandler(calls)]),
      { leaseMs: LEASE_MS },
    );

    const outcome = await service.deliverOnce();
    expect(outcome).toMatchObject({
      kind: 'delivered',
      consumerKey: CONSUMER,
      eventId: outboxEventIds.first,
      deliveryGeneration: 0,
      attemptCount: 1,
      terminal: 'uncertain',
      finalize: 'finalized',
    });

    const receipts = await fetchReceipts(client, outboxEventIds.first);
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0]!;
    expect(receipt).toMatchObject({
      consumer_key: CONSUMER,
      delivery_generation: 0,
      status: 'uncertain',
      attempt_count: 1,
      lease_expires_at: null,
      completed_at: null,
      dead_at: null,
      last_error_code: ERROR_CODE,
    });

    // The uncertain timestamp is written by PostgreSQL, between two readings of
    // the database clock — never from the Node process.
    const after = await databaseNow(client);
    expect(receipt.uncertain_at).toBeInstanceOf(Date);
    expect(receipt.uncertain_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(receipt.uncertain_at!.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(receipt.processing_started_at).toBeInstanceOf(Date);

    // Subsequent polls never redeliver an uncertain generation.
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(calls).toEqual([1]);

    // Age alone does not promote uncertain to dead: no automatic transition
    // exists anywhere in W3.4.
    await client.query(
      `UPDATE outbox_receipts
          SET uncertain_at = clock_timestamp() - INTERVAL '7 days',
              updated_at = clock_timestamp() - INTERVAL '7 days'
        WHERE outbox_event_id = $1 AND consumer_key = $2`,
      [outboxEventIds.first, CONSUMER],
    );
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    const aged = await fetchReceipts(client, outboxEventIds.first);
    expect(aged).toHaveLength(1);
    expect(aged[0]).toMatchObject({
      status: 'uncertain',
      attempt_count: 1,
      last_error_code: ERROR_CODE,
      dead_at: null,
    });

    // An uncertain generation is not replayable either: only `dead` is.
    await expect(
      service.replayDead({ outboxEventId: outboxEventIds.first, consumerKey: CONSUMER }),
    ).resolves.toEqual({ kind: 'not_replayable', reason: 'latest_generation_uncertain' });
    expect(await fetchReceipts(client, outboxEventIds.first)).toEqual(aged);
    expect(calls).toEqual([1]);
  } finally {
    await prisma.$disconnect();
  }
});

schema.test('outbox-terminal-never-redelivered', async ({ client, databaseUrl }) => {
  await insertOutboxEvent(client, { id: outboxEventIds.first });
  await insertOutboxEvent(client, { id: outboxEventIds.second, occurredOffsetMs: 1000 });
  await insertOutboxEvent(client, { id: outboxEventIds.third, occurredOffsetMs: 2000 });
  const prisma = createPrismaForUrl(databaseUrl);

  try {
    const seen: string[] = [];
    const results = new Map<string, 'completed' | 'uncertain' | 'dead'>([
      [outboxEventIds.first, 'completed'],
      [outboxEventIds.second, 'uncertain'],
      [outboxEventIds.third, 'dead'],
    ]);
    const handler: OutboxHandler = {
      consumerKey: CONSUMER,
      eventTypes: [EVENT_TYPE],
      handle: async (event) => {
        seen.push(event.eventId);
        const kind = results.get(event.eventId)!;
        return kind === 'completed' ? { kind } : { kind, errorCode: `${kind}_code` };
      },
    };
    const service = createOutboxDeliveryService(
      createDeliveryUnitOfWork(prisma),
      createOutboxHandlerRegistry([handler]),
      { leaseMs: LEASE_MS },
    );

    await service.deliverOnce();
    await service.deliverOnce();
    await service.deliverOnce();
    expect(seen).toEqual([outboxEventIds.first, outboxEventIds.second, outboxEventIds.third]);

    // Every terminal status blocks redelivery, including `dead`, which is only
    // revived through the explicit replay path.
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    await expect(service.deliverOnce()).resolves.toEqual({ kind: 'idle' });
    expect(seen).toHaveLength(3);

    const statuses = await client.query<{ outbox_event_id: string; status: string }>(
      `SELECT outbox_event_id, status FROM outbox_receipts WHERE consumer_key = $1
        ORDER BY outbox_event_id`,
      [CONSUMER],
    );
    expect(statuses.rows).toEqual([
      { outbox_event_id: outboxEventIds.first, status: 'completed' },
      { outbox_event_id: outboxEventIds.second, status: 'uncertain' },
      { outbox_event_id: outboxEventIds.third, status: 'dead' },
    ]);
  } finally {
    await prisma.$disconnect();
  }
});
