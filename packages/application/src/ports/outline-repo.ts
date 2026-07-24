import type { JsonObject, OutlineNodeRecord } from './types.js';

export type OutlineEntityType = OutlineNodeRecord['entityType'];

export interface OutlineNodeInsertInput {
  readonly entityType: OutlineEntityType;
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly ordinal: number | null;
  readonly narrativeSequence: number | null;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface OutlineNodeUpdateInput {
  readonly entityType: OutlineEntityType;
  readonly projectId: string;
  readonly id: string;
  readonly title: string;
  readonly payload: JsonObject;
  readonly expectedRevision: number | null;
  /** Beat-only purpose/title fields live in payload; optional narrative fields. */
  readonly ordinal?: number | null;
  readonly narrativeSequence?: number | null;
}

export interface OutlineRepo {
  insertNode(input: OutlineNodeInsertInput): Promise<OutlineNodeRecord>;
  updateNode(input: OutlineNodeUpdateInput): Promise<OutlineNodeRecord | null>;
  findNode(
    projectId: string,
    entityType: OutlineEntityType,
    id: string,
  ): Promise<OutlineNodeRecord | null>;
  listByProject(projectId: string): Promise<readonly OutlineNodeRecord[]>;
  findBeat(projectId: string, beatId: string): Promise<OutlineNodeRecord | null>;
}
