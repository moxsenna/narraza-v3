import type { FoundationRecord, JsonObject } from './types.js';

export interface FoundationInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface FoundationRepo {
  insert(input: FoundationInsertInput): Promise<FoundationRecord>;
  findByProjectId(projectId: string): Promise<FoundationRecord | null>;
  /** CAS on revision; returns null if revision mismatch or missing. */
  updateDraft(
    projectId: string,
    payload: JsonObject,
    expectedRevision: number,
  ): Promise<FoundationRecord | null>;
  markConfirmed(projectId: string, confirmedAt: Date): Promise<FoundationRecord | null>;
  markLocked(projectId: string, lockedAt: Date): Promise<FoundationRecord | null>;
  /** Apply foundation.update from a change set (CAS revision when expectedRevision set). */
  applyUpdate(
    projectId: string,
    payload: JsonObject,
    expectedRevision: number | null,
  ): Promise<FoundationRecord | null>;
}
