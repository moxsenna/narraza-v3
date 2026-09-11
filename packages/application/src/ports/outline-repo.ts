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

export interface BeatAcceptPointerInput {
  readonly projectId: string;
  readonly beatId: string;
  /** CAS on beats.revision: null skips the revision guard (version.create path). */
  readonly expectedRevision: number | null;
  readonly proseVersionId: string;
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
  /**
   * Set beats.accepted_prose_version_id with a CAS guard. The composite FK
   * (project_id, beat_id, accepted_prose_version_id) enforces same-beat
   * membership at the database level; returns null when the guard misses.
   */
  setBeatAcceptedProse(input: BeatAcceptPointerInput): Promise<OutlineNodeRecord | null>;
}
