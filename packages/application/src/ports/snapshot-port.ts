import type { JsonObject } from './types.js';

/** Append-only context snapshot port (full usage M4+; interface in M2). */
export interface SnapshotAppendInput {
  readonly id: string;
  readonly projectId: string;
  readonly packetKind: string;
  readonly dataClass: string;
  readonly dependencyHash: string;
  readonly contentHash: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface SnapshotPort {
  append(input: SnapshotAppendInput): Promise<void>;
}
