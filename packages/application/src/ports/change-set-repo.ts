import type {
  CanonicalChangeOperationRecord,
  CanonicalChangeSetRecord,
  JsonObject,
} from './types.js';

export interface ChangeSetInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly origin: string;
  readonly status: string;
  readonly baseCanonicalVersion: number;
  readonly operationsHash: string;
}

export interface ChangeOperationInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly changeSetId: string;
  readonly ordinal: number;
  readonly operationType: string;
  readonly targetEntityType: string;
  readonly targetEntityId: string;
  readonly expectedRevision: number | null;
  readonly risk: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface ChangeSetRepo {
  insertPending(input: ChangeSetInsertInput): Promise<CanonicalChangeSetRecord>;
  insertOperations(
    ops: readonly ChangeOperationInsertInput[],
  ): Promise<readonly CanonicalChangeOperationRecord[]>;
  markApplied(
    projectId: string,
    changeSetId: string,
    appliedCanonicalVersion: number,
  ): Promise<CanonicalChangeSetRecord | null>;
  findById(projectId: string, changeSetId: string): Promise<CanonicalChangeSetRecord | null>;
}
