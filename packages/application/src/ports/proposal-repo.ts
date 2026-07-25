import type { ProposalRecord } from './types.js';

export interface ProposalInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly groupId: string;
  readonly source: string;
  readonly status: string;
  readonly changeSetId: string | null;
  readonly schemaVersion?: number;
  readonly payload?: { readonly [key: string]: unknown };
}

export interface ProposalRepo {
  insert(input: ProposalInsertInput): Promise<ProposalRecord>;
  findById(projectId: string, id: string): Promise<ProposalRecord | null>;
}
