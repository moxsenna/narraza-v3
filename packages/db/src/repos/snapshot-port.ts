import type { SnapshotAppendInput, SnapshotPort } from '@narraza/application';
import type { TxClient } from './tx-client.js';

export function createSnapshotPort(tx: TxClient): SnapshotPort {
  return {
    async append(input: SnapshotAppendInput): Promise<void> {
      await tx.contextSnapshot.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          packetKind: input.packetKind,
          dataClass: input.dataClass,
          dependencyHash: input.dependencyHash,
          contentHash: input.contentHash,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
      });
    },
  };
}
