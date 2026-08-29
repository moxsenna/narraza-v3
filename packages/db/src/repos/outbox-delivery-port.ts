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
 *     `FOR UPDATE ... SKIP LOCKED`, so N workers never contend on one row. The
 *     ordering is global across BOTH eligibility kinds: a never-delivered event
 *     and an expired `processing` reclaim compete in one comparison. Selecting
 *     fresh work first would let a steady arrival rate starve an older delivery
 *     whose worker crashed, which is exactly the case at-least-once must recover.
 *   - Locks are always taken event row first, then receipt row, in `claimNext`
 *     and `replayDead` alike, so the two can never invert and deadlock.
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

/**
 * How many eligible events are considered per candidate sweep. The sweep only
 * reads; the authoritative decision is re-made under the event row lock. A
 * larger batch costs one extra read, a smaller one costs an extra round trip
 * when many workers are contending, so this is a throughput knob, not a
 * correctness one.
 */
const CANDIDATE_BATCH = 32;

/**
 * One eligibility list covering both claimable shapes, ordered globally by
 * `(occurred_at, id)`. `receipt_id` is `NULL` for an event this consumer has
 * never seen and set for an expired `processing` receipt awaiting reclaim.
 * `latest` collapses each event to its highest generation, so a terminal
 * generation is excluded by the `status = 'processing'` test rather than by
 * a separate query.
 *
 * The keyset predicate on `(occurred_at, id)` lets the caller resume after a
 * batch whose candidates were all taken by other workers, which is what makes
 * the retry loop terminate instead of re-reading the same head forever.
 */
const CANDIDATE_QUERY = `WITH cursor AS (
      SELECT occurred_at, id
        FROM outbox_events
       WHERE id = $3::text
    ), latest AS (
      SELECT DISTINCT ON (r.outbox_event_id)
             r.outbox_event_id, r.status, r.lease_expires_at
        FROM outbox_receipts r
       WHERE r.consumer_key = $1
       ORDER BY r.outbox_event_id, r.delivery_generation DESC
    )
    SELECT e.id AS event_id
      FROM outbox_events e
      LEFT JOIN latest l ON l.outbox_event_id = e.id
     WHERE e.event_type = ANY($2::text[])
       AND (
         l.outbox_event_id IS NULL
         OR (l.status = 'processing' AND l.lease_expires_at <= clock_timestamp())
       )
       AND (
         $3::text IS NULL
         OR (e.occurred_at, e.id) > (SELECT c.occurred_at, c.id FROM cursor c)
       )
     ORDER BY e.occurred_at ASC, e.id ASC
     LIMIT ${CANDIDATE_BATCH}`;

interface CandidateRow {
  event_id: string;
}

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
      const eventTypes = [...input.eventTypes];

      // Walk the globally ordered eligibility list. A candidate can evaporate
      // between the unlocked sweep and the lock (another worker took it, or its
      // owner finalized it), so the sweep only proposes and the decision under
      // the event lock disposes. The keyset cursor guarantees the walk makes
      // forward progress instead of re-reading a contended head.
      let cursorEventId: string | null = null;

      for (;;) {
        const candidates = (await tx.$queryRawUnsafe(
          CANDIDATE_QUERY,
          input.consumerKey,
          eventTypes,
          cursorEventId,
        )) as CandidateRow[];
        if (candidates.length === 0) return { kind: 'none' };

        for (const candidate of candidates) {
          // Event row first, then receipt row: the same order `replayDead`
          // uses, so the two operations cannot deadlock against each other.
          // SKIP LOCKED means a rival worker's candidate is passed over rather
          // than waited on.
          const locked = (await tx.$queryRawUnsafe(
            `SELECT id FROM outbox_events WHERE id = $1 FOR UPDATE SKIP LOCKED`,
            candidate.event_id,
          )) as Array<{ id: string }>;
          if (!locked[0]) continue;

          const latestRows = (await tx.$queryRawUnsafe(
            `SELECT id, delivery_generation, status,
                    lease_expires_at <= clock_timestamp() AS lease_expired
               FROM outbox_receipts
              WHERE outbox_event_id = $1 AND consumer_key = $2
              ORDER BY delivery_generation DESC
              LIMIT 1
              FOR UPDATE`,
            candidate.event_id,
            input.consumerKey,
          )) as Array<{
            id: string;
            delivery_generation: number;
            status: string;
            lease_expired: boolean | null;
          }>;
          const latest = latestRows[0];

          // Case A: this consumer has never seen the event -> generation 0,
          // attempt 1.
          if (!latest) {
            const inserted = (await tx.$queryRawUnsafe(
              `WITH inserted AS (
                  INSERT INTO outbox_receipts
                    (id, outbox_event_id, consumer_key, delivery_generation, status, attempt_count,
                     processing_started_at, lease_expires_at, completed_at, uncertain_at, dead_at,
                     last_error_code, created_at, updated_at)
                  VALUES (gen_random_uuid()::text, $1, $2, 0, 'processing', 1,
                          clock_timestamp(),
                          clock_timestamp() + ($3::bigint * INTERVAL '1 millisecond'),
                          NULL, NULL, NULL, NULL, now(), now())
                  RETURNING ${RECEIPT_COLUMNS}
                )
                SELECT ${CLAIM_RETURNING}
                  FROM inserted r
                  JOIN outbox_events e ON e.id = r.outbox_event_id`,
              candidate.event_id,
              input.consumerKey,
              leaseMs,
            )) as ClaimRow[];
            const insertedRow = inserted[0];
            if (insertedRow) return { kind: 'claimed', ...toClaim(insertedRow) };
            continue;
          }

          // Case C: completed, uncertain and dead are terminal for their
          // generation. Only `replayDead` moves a dead letter forward.
          if (latest.status !== 'processing' || latest.lease_expired !== true) continue;

          // Case B: the lease lapsed -> reclaim the SAME generation and bump
          // the attempt fence, which invalidates the previous claimant.
          const reclaimed = (await tx.$queryRawUnsafe(
            `WITH claimed AS (
                UPDATE outbox_receipts
                   SET attempt_count = attempt_count + 1,
                       processing_started_at = clock_timestamp(),
                       lease_expires_at = clock_timestamp() + ($2::bigint * INTERVAL '1 millisecond'),
                       updated_at = now()
                 WHERE id = $1
                   AND status = 'processing'
                   AND lease_expires_at <= clock_timestamp()
                RETURNING ${RECEIPT_COLUMNS}
              )
              SELECT ${CLAIM_RETURNING}
                FROM claimed r
                JOIN outbox_events e ON e.id = r.outbox_event_id`,
            latest.id,
            leaseMs,
          )) as ClaimRow[];
          const reclaimedRow = reclaimed[0];
          if (reclaimedRow) return { kind: 'claimed', ...toClaim(reclaimedRow) };
        }

        // Every candidate in this batch was taken or finalized by someone else.
        // If the batch was short there is nothing further to inspect; otherwise
        // resume strictly after the last one examined.
        if (candidates.length < CANDIDATE_BATCH) return { kind: 'none' };
        const last = candidates[candidates.length - 1]!;
        // Resolve the next keyset tuple from this ID inside PostgreSQL on the
        // next sweep. `timestamptz` has microsecond precision while JavaScript
        // `Date` has only milliseconds; round-tripping the timestamp through
        // Node could make the same full batch eligible again forever.
        cursorEventId = last.event_id;
      }
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
