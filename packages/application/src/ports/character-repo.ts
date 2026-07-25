import type { CharacterRecord, JsonObject } from './types.js';

export interface CharacterInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly displayName: string;
  readonly role: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface CharacterUpdateInput {
  readonly projectId: string;
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly payload: JsonObject;
  readonly expectedRevision: number | null;
}

export interface CharacterRepo {
  insert(input: CharacterInsertInput): Promise<CharacterRecord>;
  update(input: CharacterUpdateInput): Promise<CharacterRecord | null>;
  findById(projectId: string, id: string): Promise<CharacterRecord | null>;
  listByProject(projectId: string): Promise<readonly CharacterRecord[]>;
  softDelete(projectId: string, id: string, deletedAt: Date): Promise<boolean>;
}
