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
  };
}
