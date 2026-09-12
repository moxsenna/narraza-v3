import type { OutboxAppendInput, OutboxPort } from '@narraza/application';
import type { TxClient } from './tx-client.js';

export function createOutboxPort(tx: TxClient): OutboxPort {
  return {
    async append(input: OutboxAppendInput): Promise<void> {
      await tx.outboxEvent.create({
        data: {
          id: input.id,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          eventType: input.eventType,
          dedupeKey: input.dedupeKey,
          occurredAt: input.occurredAt,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
      });
    },

    async appendCreditOverageIncident(input) {
      const expectedKey = `incident:credit-overage:${input.reservationId}:${input.allocationId}`;
      if (input.dedupeKey !== expectedKey) return { kind: 'conflict' };
      const payload = {
        allocationId: input.allocationId,
        intendedSettlementMicroIdr: input.intendedSettlementMicroIdr.toString(),
        actualSettlementMicroIdr: input.actualSettlementMicroIdr.toString(),
        systemSubsidyMicroIdr: input.systemSubsidyMicroIdr.toString(),
      };
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO outbox_events
           (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
         VALUES ($1,'credit_reservation',$2,'credit.overage_detected',$3,now(),1,$4::jsonb,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.id,
        input.reservationId,
        input.dedupeKey,
        JSON.stringify(payload),
      )) as Array<{ id: string }>;
      if (inserted[0]) return { kind: 'appended' };

      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
           FROM outbox_events WHERE dedupe_key=$1`,
        input.dedupeKey,
      )) as Array<{
        id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        dedupe_key: string;
        schema_version: number;
        payload: unknown;
      }>;
      const row = rows[0];
      return row &&
        exactIncident(
          row,
          {
            id: input.id,
            aggregateType: 'credit_reservation',
            aggregateId: input.reservationId,
            dedupeKey: input.dedupeKey,
            eventType: 'credit.overage_detected',
          },
          payload,
        )
        ? { kind: 'replayed' }
        : { kind: 'conflict' };
    },

    async appendReservationReconciliationIncident(input) {
      const allocationKey = input.allocationId ?? 'none';
      const expectedKey = `incident:reservation-reconciliation:${input.reservationId}:${input.jobId}:${input.reason}:${allocationKey}`;
      if (input.dedupeKey !== expectedKey) return { kind: 'conflict' };
      const payload = {
        jobId: input.jobId,
        reason: input.reason,
        allocationId: input.allocationId,
      };
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO outbox_events
           (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
         VALUES ($1,'credit_reservation',$2,'credit.reservation_reconciliation_conflict',$3,now(),1,$4::jsonb,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.id,
        input.reservationId,
        input.dedupeKey,
        JSON.stringify(payload),
      )) as Array<{ id: string }>;
      if (inserted[0]) return { kind: 'appended' };

      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
           FROM outbox_events WHERE dedupe_key=$1`,
        input.dedupeKey,
      )) as Array<IncidentRow>;
      const row = rows[0];
      return row &&
        exactIncident(
          row,
          {
            id: input.id,
            aggregateType: 'credit_reservation',
            aggregateId: input.reservationId,
            dedupeKey: input.dedupeKey,
            eventType: 'credit.reservation_reconciliation_conflict',
          },
          payload,
        )
        ? { kind: 'replayed' }
        : { kind: 'conflict' };
    },

    async appendMissingJobReservationIncident(input) {
      const expectedKey = `incident:job-missing-reservation:${input.jobId}`;
      if (input.dedupeKey !== expectedKey) return { kind: 'conflict' };
      const payload = {
        projectId: input.projectId,
        jobId: input.jobId,
        jobKind: input.jobKind,
        fundingModel: input.fundingModel,
      };
      let inserted: Array<{ id: string }> = [];
      const savepoint = `incident_insert_${Math.random().toString(36).slice(2)}`;
      await tx.$queryRawUnsafe(`SAVEPOINT ${savepoint}`);
      try {
        inserted = (await tx.$queryRawUnsafe(
          `INSERT INTO outbox_events
             (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
           VALUES ($1,'generation_job',$2,'credit.job_missing_reservation',$3,now(),1,$4::jsonb,now())
           ON CONFLICT (dedupe_key) DO NOTHING
           RETURNING id`,
          input.id,
          input.jobId,
          input.dedupeKey,
          JSON.stringify(payload),
        )) as Array<{ id: string }>;
      } catch (error) {
        // Concurrent first-append can violate the primary key (id === dedupe key)
        // instead of the dedupe arbiter. Contain the failed statement with a
        // savepoint, then fall through to semantic replay comparison.
        await tx.$queryRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        if (!isUniqueViolation(error)) throw error;
      }
      await tx.$queryRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      if (inserted[0]) return { kind: 'appended' };

      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
           FROM outbox_events WHERE dedupe_key=$1`,
        input.dedupeKey,
      )) as Array<IncidentRow>;
      const row = rows[0];
      return row &&
        exactIncident(
          row,
          {
            id: input.id,
            aggregateType: 'generation_job',
            aggregateId: input.jobId,
            dedupeKey: input.dedupeKey,
            eventType: 'credit.job_missing_reservation',
          },
          payload,
        )
        ? { kind: 'replayed' }
        : { kind: 'conflict' };
    },
  };
}

interface IncidentRow {
  readonly id: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly dedupe_key: string;
  readonly schema_version: number;
  readonly payload: unknown;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const direct = error as { code?: string; meta?: { code?: string } };
    if (direct.code === '23505' || direct.meta?.code === '23505') return true;
  }
  return String(error).includes('23505');
}

/**
 * Exact semantic comparison of a stored incident tuple against the caller's
 * replay: identity columns plus exact payload key count and scalar values.
 * Any divergence means the caller's semantics differ from what was durably
 * recorded under this dedupe key.
 */
function exactIncident(
  row: IncidentRow,
  identity: {
    readonly id: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly dedupeKey: string;
    readonly eventType: string;
  },
  payload: Record<string, unknown>,
): boolean {
  if (typeof row.payload !== 'object' || row.payload === null || Array.isArray(row.payload)) {
    return false;
  }
  const actual = row.payload as Record<string, unknown>;
  return (
    row.id === identity.id &&
    row.aggregate_type === identity.aggregateType &&
    row.aggregate_id === identity.aggregateId &&
    row.event_type === identity.eventType &&
    row.dedupe_key === identity.dedupeKey &&
    row.schema_version === 1 &&
    Object.keys(actual).length === Object.keys(payload).length &&
    Object.entries(payload).every(([key, value]) => actual[key] === value)
  );
}
