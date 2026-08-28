import type { OutboxDeliveryUnitOfWork } from '@narraza/application';
import type { Pool } from 'pg';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { createOutboxDeliveryUnitOfWork } from '../outbox-delivery-unit-of-work.js';

/**
 * Test-only fixtures for the W3.4 outbox delivery suites.
 *
 * Every operational timestamp written here comes from the PostgreSQL clock
 * (`clock_timestamp()` / `now()`); no Node-side `Date` ever drives row state,
 * so a skewed test host cannot fake lease ownership.
 */

export const outboxEventIds = {
  first: '80000000-0000-4000-8000-000000000001',
  second: '80000000-0000-4000-8000-000000000002',
  third: '80000000-0000-4000-8000-000000000003',
} as const;

export const CONSUMER = 'test-consumer';

export interface OutboxEventFields {
  readonly id: string;
  readonly eventType?: string;
  readonly dedupeKey?: string;
  readonly aggregateId?: string;
  readonly occurredOffsetMs?: number;
  readonly schemaVersion?: number;
  readonly payload?: string;
}

/** Append one immutable event row, exactly as the write side would. */
export async function insertOutboxEvent(client: Pool, fields: OutboxEventFields): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events
       (id, aggregate_type, aggregate_id, event_type, dedupe_key, occurred_at,
        schema_version, payload, created_at)
     VALUES ($1, 'generation_job', COALESCE($2,$1), $3, $4,
             now() + ($5::bigint * INTERVAL '1 millisecond'),
             COALESCE($6::int, 1), COALESCE($7::jsonb, '{}'::jsonb), now())`,
    [
      fields.id,
      fields.aggregateId ?? null,
      fields.eventType ?? 'generation_job.published',
      fields.dedupeKey ?? `job-published:${fields.id}`,
      String(fields.occurredOffsetMs ?? 0),
      fields.schemaVersion ?? null,
      fields.payload ?? null,
    ],
  );
}

export interface ReceiptRow {
  outbox_event_id: string;
  consumer_key: string;
  delivery_generation: number;
  status: string;
  attempt_count: number;
  processing_started_at: Date | null;
  lease_expires_at: Date | null;
  completed_at: Date | null;
  uncertain_at: Date | null;
  dead_at: Date | null;
  last_error_code: string | null;
}

export async function fetchReceipts(
  client: Pool,
  outboxEventId: string,
  consumerKey: string = CONSUMER,
): Promise<ReceiptRow[]> {
  const result = await client.query<ReceiptRow>(
    `SELECT outbox_event_id, consumer_key, delivery_generation, status, attempt_count,
            processing_started_at, lease_expires_at, completed_at, uncertain_at,
            dead_at, last_error_code
       FROM outbox_receipts
      WHERE outbox_event_id = $1 AND consumer_key = $2
      ORDER BY delivery_generation ASC`,
    [outboxEventId, consumerKey],
  );
  return result.rows;
}

/**
 * Force the live lease into the past using the PostgreSQL clock. This is how a
 * crashed worker looks to every other worker: the row is still `processing`,
 * but the lease no longer covers it.
 */
export async function expireLease(
  client: Pool,
  outboxEventId: string,
  consumerKey: string = CONSUMER,
): Promise<void> {
  await client.query(
    `UPDATE outbox_receipts
        SET lease_expires_at = clock_timestamp() - INTERVAL '1 millisecond'
      WHERE outbox_event_id = $1 AND consumer_key = $2 AND status = 'processing'`,
    [outboxEventId, consumerKey],
  );
}

/** PostgreSQL transaction clock, for ordering assertions against row values. */
export async function databaseNow(client: Pool): Promise<Date> {
  const result = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  return result.rows[0]!.now;
}

export function createPrismaForUrl(databaseUrl: string): PrismaClient {
  return createPrismaClient(databaseUrl);
}

export function createDeliveryUnitOfWork(prisma: PrismaClient): OutboxDeliveryUnitOfWork {
  return createOutboxDeliveryUnitOfWork(prisma);
}
