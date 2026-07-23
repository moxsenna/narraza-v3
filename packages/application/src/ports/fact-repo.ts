import type { FactRecord, JsonObject } from './types.js';

export interface FactInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly factKey: string;
  readonly canonStatus: string;
  readonly visibility: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface FactUpdateInput {
  readonly projectId: string;
  readonly id: string;
  readonly canonStatus: string;
  readonly visibility: string;
  readonly payload: JsonObject;
  readonly expectedRevision: number | null;
}

export interface FactRepo {
  insert(input: FactInsertInput): Promise<FactRecord>;
  update(input: FactUpdateInput): Promise<FactRecord | null>;
  findById(projectId: string, id: string): Promise<FactRecord | null>;
  listByProject(projectId: string): Promise<readonly FactRecord[]>;
}
