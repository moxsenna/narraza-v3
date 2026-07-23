import type { CanonicalOperationType, Ref } from './entities.js';
import type { NormalizedOperationPayload } from './payloads.js';

export interface NormalizedOperationDraft {
  readonly schemaVersion: 1;
  readonly localRef: string;
  readonly operationType: CanonicalOperationType;
  readonly target: Ref;
  readonly payload: NormalizedOperationPayload;
  readonly dependsOn: readonly string[];
}
