import type { AuditAppendInput, AuditPort, JsonObject } from '@narraza/application';
import type { TxClient } from './tx-client.js';

export function createAuditPort(tx: TxClient): AuditPort {
  return {
    async append(input: AuditAppendInput): Promise<void> {
      await tx.auditEvent.create({
        data: {
          userId: input.userId,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          metadata: (input.metadata ?? null) as never,
        },
      });
    },
  };
}

export type { JsonObject };
