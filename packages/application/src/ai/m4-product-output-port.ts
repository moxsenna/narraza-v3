import type { JsonObject } from '../ports/types.js';

export interface PublishM4ProductOutputInput {
  readonly projectId: string;
  readonly jobId: string;
  readonly workflowKind: string;
  readonly dependencyHash: string;
  readonly jobPayload: JsonObject;
  readonly stageOutputs: Readonly<Record<string, JsonObject>>;
}

/** Tx C product projection. Adapter must be idempotent by deterministic job IDs. */
export interface M4ProductOutputPort {
  publish(input: PublishM4ProductOutputInput): Promise<void>;
}
