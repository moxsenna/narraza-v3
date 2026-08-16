/** Shared plain records returned by domain ports (application-owned shapes). */

export type JsonObject = { readonly [key: string]: unknown };

export type GenerationJobStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';

/** Absorbing states: a job in one of these never transitions again. */
export type TerminalJobStatus = 'succeeded' | 'failed' | 'dead' | 'cancelled';

export interface GenerationJobRecord {
  readonly id: string;
  readonly projectId: string;
  readonly kind: string;
  readonly status: GenerationJobStatus;
  readonly priority: number;
  readonly availableAt: Date;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly fenceVersion: number;
  readonly cancelRequestedAt: Date | null;
  readonly retryOfJobId: string | null;
  readonly bundleId: string | null;
  readonly workflowPlanId: string | null;
  readonly reservationId: string | null;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface JobLeaseIdentity {
  readonly projectId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly fenceVersion: number;
}

export type WorkflowInvocationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type GenerationAttemptStatus = 'started' | 'succeeded' | 'failed' | 'cancelled';

export interface WorkflowInvocationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly stageKey: string;
  readonly status: WorkflowInvocationStatus;
  readonly winnerAttemptId: string | null;
  readonly fenceVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GenerationAttemptRecord {
  readonly id: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly invocationId: string;
  readonly ordinal: number;
  readonly status: GenerationAttemptStatus;
  readonly providerRequestId: string | null;
  readonly resultHash: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

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

export interface CreditQuoteRecord {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly workflowPlanProjectId: string | null;
  readonly workflowPlanId: string | null;
  readonly workflowPlanHash: string;
  readonly dependencyHash: string;
  readonly maxAmountMicroIdr: bigint;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly requestId: string | null;
  readonly createdAt: Date;
}
