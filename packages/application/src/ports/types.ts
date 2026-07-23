/** Shared plain records returned by domain ports (application-owned shapes). */

export type JsonObject = { readonly [key: string]: unknown };

export interface ProjectRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly intakePath: string;
  readonly status: string;
  readonly currentCanonicalVersion: number;
  readonly revision: number;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FoundationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly revision: number;
  readonly confirmedAt: Date | null;
  readonly lockedAt: Date | null;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface CharacterRecord {
  readonly id: string;
  readonly projectId: string;
  readonly displayName: string;
  readonly role: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly deletedAt: Date | null;
}

export interface FactRecord {
  readonly id: string;
  readonly projectId: string;
  readonly factKey: string;
  readonly canonStatus: string;
  readonly visibility: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly deletedAt: Date | null;
}

export interface OutlineNodeRecord {
  readonly entityType: 'roadmap' | 'arc' | 'chapter' | 'beat';
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly ordinal: number | null;
  readonly narrativeSequence: number | null;
  readonly revision: number;
  readonly acceptedProseVersionId: string | null;
  readonly payload: JsonObject;
  readonly deletedAt: Date | null;
}

export interface RevealRecord {
  readonly id: string;
  readonly projectId: string;
  readonly factId: string;
  readonly chapterId: string;
  readonly beatId: string | null;
  readonly targetSequence: number;
  readonly revision: number;
  readonly payload: JsonObject;
}

export interface RevealBreadcrumbRecord {
  readonly id: string;
  readonly projectId: string;
  readonly revealId: string;
  readonly chapterId: string;
  readonly beatId: string | null;
  readonly sequence: number;
  readonly payload: JsonObject;
}

export interface IntakeSessionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly signalCount: number;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface IntakeMessageRecord {
  readonly id: string;
  readonly projectId: string;
  readonly intakeSessionId: string;
  readonly role: string;
  readonly sequence: number;
  readonly content: string;
  readonly jobId: string | null;
  readonly createdAt: Date;
}

export interface CanonicalChangeSetRecord {
  readonly id: string;
  readonly projectId: string;
  readonly origin: string;
  readonly status: string;
  readonly baseCanonicalVersion: number;
  readonly operationsHash: string;
  readonly appliedCanonicalVersion: number | null;
}

export interface CanonicalChangeOperationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly changeSetId: string;
  readonly ordinal: number;
  readonly operationType: string;
  readonly targetEntityType: string;
  readonly targetEntityId: string;
  readonly expectedRevision: number | null;
  readonly risk: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface ProposalRecord {
  readonly id: string;
  readonly projectId: string;
  readonly groupId: string;
  readonly source: string;
  readonly status: string;
  readonly changeSetId: string | null;
}
