import type { JsonObject } from './types.js';

/**
 * Read-only view port over the M4 workflow product projections
 * (concept_sets/concepts, proposal_groups/generated_candidates,
 * artifact_proposals) plus the prose_versions rows they may reference.
 *
 * Write access stays exclusively with `m4ProductOutput` (Tx C projection);
 * this port exists so adapters (dev/mock preview harness) can OBSERVE the
 * published product state through the port boundary without raw SQL or
 * direct Prisma access (D8).
 */
export interface M4ConceptSetView {
  readonly id: string;
  readonly status: string;
  readonly sourceJobId: string | null;
  readonly concepts: readonly {
    readonly id: string;
    readonly ordinal: number;
    readonly title: string;
    readonly synopsis: string;
  }[];
}

export interface M4CandidateGroupView {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly sourceJobId: string | null;
  readonly candidates: readonly {
    readonly id: string;
    readonly ordinal: number;
    readonly payload: JsonObject;
  }[];
}

export interface M4ArtifactProposalView {
  readonly id: string;
  readonly status: string;
  readonly proseVersionId: string;
  readonly sourceJobId: string | null;
  readonly payload: JsonObject;
}

export interface M4ProseVersionView {
  readonly id: string;
  readonly beatId: string;
  readonly content: string;
}

export interface M4ProductReadPort {
  /** Newest concept set for the project with its published concepts. */
  findLatestConceptSet(projectId: string): Promise<M4ConceptSetView | null>;
  /** Newest published candidate group for one M4 workflow kind. */
  findLatestCandidateGroup(projectId: string, kind: string): Promise<M4CandidateGroupView | null>;
  /** Newest pending artifact proposal for the project. */
  findLatestArtifactProposal(projectId: string): Promise<M4ArtifactProposalView | null>;
  /** Newest prose version row for the project (prerequisite context). */
  findLatestProseVersion(projectId: string): Promise<M4ProseVersionView | null>;
}
