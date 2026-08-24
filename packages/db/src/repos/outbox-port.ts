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
      return row && exactIncident(row, input.id, input.reservationId, input.dedupeKey, payload)
        ? { kind: 'replayed' }
        : { kind: 'conflict' };
    },
  };
}

function exactIncident(
  row: {
    id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    dedupe_key: string;
    schema_version: number;
    payload: unknown;
  },
  id: string,
  reservationId: string,
  dedupeKey: string,
  payload: Record<string, string>,
): boolean {
  if (typeof row.payload !== 'object' || row.payload === null || Array.isArray(row.payload)) {
    return false;
  }
  const actual = row.payload as Record<string, unknown>;
  return (
    row.id === id &&
    row.aggregate_type === 'credit_reservation' &&
    row.aggregate_id === reservationId &&
    row.event_type === 'credit.overage_detected' &&
    row.dedupe_key === dedupeKey &&
    row.schema_version === 1 &&
    Object.keys(actual).length === Object.keys(payload).length &&
    Object.entries(payload).every(([key, value]) => actual[key] === value)
  );
}
