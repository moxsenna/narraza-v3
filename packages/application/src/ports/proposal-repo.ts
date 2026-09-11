import type { ProposalRecord } from './types.js';

export interface ProposalInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly groupId: string;
  readonly source: string;
  readonly status: string;
  readonly changeSetId: string | null;
  readonly operationsHash: string;
  readonly dependencyHash: string;
  readonly revalidatedFromProposalId?: string | null;
  readonly validationReportId?: string | null;
  readonly schemaVersion?: number;
  readonly payload?: { readonly [key: string]: unknown };
}

export interface ProposalGroupRecord {
  readonly id: string;
  readonly projectId: string;
  readonly kind: string;
  readonly status: string;
  readonly dependencyHash: string;
  readonly sourceJobId: string | null;
}

export interface ProposalGroupInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly kind: string;
  readonly status: string;
  readonly dependencyHash: string;
  readonly sourceJobId?: string | null;
}

export interface ProposalRepo {
  insert(input: ProposalInsertInput): Promise<ProposalRecord>;
  findById(projectId: string, id: string): Promise<ProposalRecord | null>;
  /**
   * Conditional status transition: only when current status equals
   * `expected`. Returns the updated row, or null when the CAS missed
   * (already decided by a concurrent transaction).
   */
  setStatus(
    projectId: string,
    id: string,
    expected: string,
    next: string,
  ): Promise<ProposalRecord | null>;
  /** Pending siblings in the same group, excluding one proposal id. */
  listPendingInGroup(
    projectId: string,
    groupId: string,
    excludeId: string,
  ): Promise<readonly ProposalRecord[]>;
}

export interface ProposalGroupRepo {
  insert(input: ProposalGroupInsertInput): Promise<ProposalGroupRecord>;
  findById(projectId: string, id: string): Promise<ProposalGroupRecord | null>;
  setStatus(
    projectId: string,
    id: string,
    expected: string,
    next: string,
  ): Promise<ProposalGroupRecord | null>;
  /** Pending groups for a project, oldest first (read model). */
  listPendingByProject(projectId: string): Promise<readonly ProposalGroupRecord[]>;
}
