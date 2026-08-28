import type {
  ClaimNextOutboxInput,
  ClaimNextOutboxResult,
  JsonObject,
  OutboxClaim,
  OutboxDeliveryPort,
  OutboxFailureFence,
  OutboxFinalizeFence,
  OutboxFinalizeResult,
  ReplayDeadOutboxInput,
  ReplayDeadOutboxResult,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * `OutboxDeliveryPort` adapter over `outbox_events` + `outbox_receipts`.
 *
 * Invariants enforced here rather than in the caller:
 *
 *   - Candidate selection is deterministic (`occurred_at ASC, id ASC`) and uses
 *     `FOR UPDATE ... SKIP LOCKED`, so N workers never contend on one row.
 *   - Lease eligibility is decided by `clock_timestamp()`. A Node-side `Date`
 *     is never compared against `lease_expires_at`: a skewed worker clock must
 *     not be able to steal a live lease.
 *   - Finalization is a compare-and-set on
 *     `(outbox_event_id, consumer_key, delivery_generation, attempt_count)`
 *     plus `status = 'processing'` and a still-live lease. A superseded
 *     claimant therefore updates zero rows and reports `stale`.
 *   - Terminal generations never return to `processing`; `dead` is revived only
 *     by `replayDead`, which opens generation `previous + 1` over the SAME
 *     immutable event row.
 */

const RECEIPT_COLUMNS = `id, outbox_event_id, consumer_key, delivery_generation, status,
       attempt_count, processing_started_at, lease_expires_at, completed_at, uncertain_at,
       dead_at, last_error_code`;

/**
 * The reclaim statement is `UPDATE outbox_receipts r ... FROM candidate c`, so
 * both relations are in `RETURNING` scope and every column must be qualified;
 * an unqualified `id` there is rejected as `42702 column reference is ambiguous`.
 */
const RECEIPT_COLUMNS_QUALIFIED = RECEIPT_COLUMNS.split(',')
  .map((column) => `r.${column.trim()}`)
  .join(', ');

interface ClaimRow {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  dedupe_key: string;
  schema_version: number;
  payload: unknown;
  occurred_at: Date;
  consumer_key: string;
  delivery_generation: number;
  attempt_count: number;
  lease_expires_at: Date;
}

function toClaim(row: ClaimRow): OutboxClaim {
  return {
    event: {
      eventId: row.event_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      dedupeKey: row.dedupe_key,
      schemaVersion: row.schema_version,
      payload: (row.payload ?? {}) as JsonObject,
      occurredAt: row.occurred_at,
    },
    receipt: {
      consumerKey: row.consumer_key,
      deliveryGeneration: row.delivery_generation,
      attemptCount: row.attempt_count,
      leaseExpiresAt: row.lease_expires_at,
    },
  };
}

const CLAIM_RETURNING = `e.id AS event_id, e.aggregate_type, e.aggregate_id, e.event_type,
         e.dedupe_key, e.schema_version, e.payload, e.occurred_at,
         r.consumer_key, r.delivery_generation, r.attempt_count, r.lease_expires_at`;

function requireErrorCode(fence: OutboxFailureFence): string {
  const code = fence.errorCode;
  if (typeof code !== 'string' || code.trim() === '') {
    throw new Error('outbox delivery: errorCode must be a non-empty string');
  }
  return code;
}

function requireLeaseMs(leaseMs: number): bigint {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new RangeError('outbox delivery: leaseMs must be a positive safe integer');
  }
  return BigInt(leaseMs);
}

export function createOutboxDeliveryPort(tx: TxClient): OutboxDeliveryPort {
  /** Shared CAS tail for every finalization. Matches the live attempt only. */
  const finalize = async (
    fence: OutboxFinalizeFence,
    setClause: string,
    errorCode: string | null,
  ): Promise<OutboxFinalizeResult> => {
    const rows = (await tx.$queryRawUnsafe(
      `UPDATE outbox_receipts
          SET ${setClause},
              updated_at = now()
        WHERE outbox_event_id = $1
          AND consumer_key = $2
          AND delivery_generation = $3
          AND attempt_count = $4
          AND status = 'processing'
          AND lease_expires_at > clock_timestamp()
      RETURNING id`,
      fence.outboxEventId,
      fence.consumerKey,
      fence.deliveryGeneration,
      fence.attemptCount,
      ...(errorCode === null ? [] : [errorCode]),
    )) as Array<{ id: string }>;
    return rows[0] ? { kind: 'finalized' } : { kind: 'stale' };
  };

  return {
    async claimNext(input: ClaimNextOutboxInput): Promise<ClaimNextOutboxResult> {
      const leaseMs = requireLeaseMs(input.leaseMs);
      if (input.eventTypes.length === 0) return { kind: 'none' };

      // Case A: no receipt for this consumer yet -> generation 0, attempt 1.
      const fresh = (await tx.$queryRawUnsafe(
        `WITH candidate AS (
            SELECT e.id
              FROM outbox_events e
             WHERE e.event_type = ANY($2::text[])
               AND NOT EXISTS (
                 SELECT 1 FROM outbox_receipts r
                  WHERE r.outbox_event_id = e.id AND r.consumer_key = $1
               )
             ORDER BY e.occurred_at ASC, e.id ASC
             FOR UPDATE OF e SKIP LOCKED
             LIMIT 1
          ), inserted AS (
            INSERT INTO outbox_receipts
              (id, outbox_event_id, consumer_key, delivery_generation, status, attempt_count,
               processing_started_at, lease_expires_at, completed_at, uncertain_at, dead_at,
               last_error_code, created_at, updated_at)
            SELECT gen_random_uuid()::text, candidate.id, $1, 0, 'processing', 1,
                   clock_timestamp(),
                   clock_timestamp() + ($3::bigint * INTERVAL '1 millisecond'),
                   NULL, NULL, NULL, NULL, now(), now()
              FROM candidate
            RETURNING ${RECEIPT_COLUMNS}
          )
          SELECT ${CLAIM_RETURNING}
            FROM inserted r
            JOIN outbox_events e ON e.id = r.outbox_event_id`,
        input.consumerKey,
        [...input.eventTypes],
        leaseMs,
      )) as ClaimRow[];
      const freshRow = fresh[0];
      if (freshRow) return { kind: 'claimed', ...toClaim(freshRow) };

      // Case B: latest generation is `processing` with an expired lease ->
      // reclaim the SAME generation and bump the attempt fence. Case C
      // (completed/uncertain/dead) is excluded by `status = 'processing'`.
      const reclaimed = (await tx.$queryRawUnsafe(
        `WITH latest AS (
            SELECT DISTINCT ON (r.outbox_event_id)
                   r.id, r.outbox_event_id, r.status, r.lease_expires_at, e.occurred_at
              FROM outbox_receipts r
              JOIN outbox_events e ON e.id = r.outbox_event_id
             WHERE r.consumer_key = $1
               AND e.event_type = ANY($2::text[])
             ORDER BY r.outbox_event_id, r.delivery_generation DESC
          ), candidate AS (
            SELECT r.id
              FROM outbox_receipts r
              JOIN latest l ON l.id = r.id
             WHERE l.status = 'processing'
               AND l.lease_expires_at <= clock_timestamp()
             ORDER BY l.occurred_at ASC, l.outbox_event_id ASC
             FOR UPDATE OF r SKIP LOCKED
             LIMIT 1
          ), claimed AS (
            UPDATE outbox_receipts r
               SET attempt_count = r.attempt_count + 1,
                   processing_started_at = clock_timestamp(),
                   lease_expires_at = clock_timestamp() + ($3::bigint * INTERVAL '1 millisecond'),
                   updated_at = now()
              FROM candidate c
             WHERE r.id = c.id
               AND r.status = 'processing'
               AND r.lease_expires_at <= clock_timestamp()
            RETURNING ${RECEIPT_COLUMNS_QUALIFIED}
          )
          SELECT ${CLAIM_RETURNING}
            FROM claimed r
            JOIN outbox_events e ON e.id = r.outbox_event_id`,
        input.consumerKey,
        [...input.eventTypes],
        leaseMs,
      )) as ClaimRow[];
      const reclaimedRow = reclaimed[0];
      return reclaimedRow ? { kind: 'claimed', ...toClaim(reclaimedRow) } : { kind: 'none' };
    },

    complete(fence: OutboxFinalizeFence): Promise<OutboxFinalizeResult> {
      return finalize(
        fence,
        `status = 'completed',
              lease_expires_at = NULL,
              completed_at = clock_timestamp(),
              uncertain_at = NULL,
              dead_at = NULL,
              last_error_code = NULL`,
        null,
      );
    },

    markUncertain(fence: OutboxFailureFence): Promise<OutboxFinalizeResult> {
      const errorCode = requireErrorCode(fence);
      return finalize(
        fence,
        `status = 'uncertain',
              lease_expires_at = NULL,
              completed_at = NULL,
              uncertain_at = clock_timestamp(),
              dead_at = NULL,
              last_error_code = $5`,
        errorCode,
      );
    },

    markDead(fence: OutboxFailureFence): Promise<OutboxFinalizeResult> {
      const errorCode = requireErrorCode(fence);
      return finalize(
        fence,
        `status = 'dead',
              lease_expires_at = NULL,
              completed_at = NULL,
              uncertain_at = NULL,
              dead_at = clock_timestamp(),
              last_error_code = $5`,
        errorCode,
      );
    },

    async replayDead(input: ReplayDeadOutboxInput): Promise<ReplayDeadOutboxResult> {
      const leaseMs = requireLeaseMs(input.leaseMs);

      // Lock the event first so two concurrent replays serialize on one row;
      // the unique (event, consumer, generation) index is the second line of
      // defence if they somehow both read the same latest generation.
      const events = (await tx.$queryRawUnsafe(
        `SELECT id FROM outbox_events WHERE id = $1 FOR UPDATE`,
        input.outboxEventId,
      )) as Array<{ id: string }>;
      if (!events[0]) return { kind: 'not_replayable', reason: 'receipt_not_found' };

      const latestRows = (await tx.$queryRawUnsafe(
        `SELECT delivery_generation, status
           FROM outbox_receipts
          WHERE outbox_event_id = $1 AND consumer_key = $2
          ORDER BY delivery_generation DESC
          LIMIT 1
          FOR UPDATE`,
        input.outboxEventId,
        input.consumerKey,
      )) as Array<{ delivery_generation: number; status: string }>;
      const latest = latestRows[0];
      if (!latest) return { kind: 'not_replayable', reason: 'receipt_not_found' };
      if (latest.status === 'processing') {
        return { kind: 'not_replayable', reason: 'latest_generation_processing' };
      }
      if (latest.status === 'completed') {
        return { kind: 'not_replayable', reason: 'latest_generation_completed' };
      }
      if (latest.status === 'uncertain') {
        return { kind: 'not_replayable', reason: 'latest_generation_uncertain' };
      }

      const rows = (await tx.$queryRawUnsafe(
        `WITH inserted AS (
            INSERT INTO outbox_receipts
              (id, outbox_event_id, consumer_key, delivery_generation, status, attempt_count,
               processing_started_at, lease_expires_at, completed_at, uncertain_at, dead_at,
               last_error_code, created_at, updated_at)
            VALUES (gen_random_uuid()::text, $1, $2, $3, 'processing', 1,
                    clock_timestamp(),
                    clock_timestamp() + ($4::bigint * INTERVAL '1 millisecond'),
                    NULL, NULL, NULL, NULL, now(), now())
            RETURNING ${RECEIPT_COLUMNS}
          )
          SELECT ${CLAIM_RETURNING}
            FROM inserted r
            JOIN outbox_events e ON e.id = r.outbox_event_id`,
        input.outboxEventId,
        input.consumerKey,
        latest.delivery_generation + 1,
        leaseMs,
      )) as ClaimRow[];
      const row = rows[0];
      if (!row) return { kind: 'not_replayable', reason: 'receipt_not_found' };
      return { kind: 'replayed', ...toClaim(row) };
    },
  };
}
