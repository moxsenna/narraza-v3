/**
 * Publish artifact ports (W5.3). ArtifactProposal rows are written by the M4
 * `publish_package` projection; the W5.3 publish use-case accepts one and
 * materializes immutable PublishArtifact rows without touching canon.
 */
import type { JsonObject } from './types.js';

export interface ArtifactProposalRecord {
  readonly id: string;
  readonly projectId: string;
  readonly proseVersionId: string;
  readonly status: string;
  readonly dependencyHash: string;
  readonly sourceJobId: string | null;
  readonly payload: JsonObject;
}

export interface PublishArtifactRecord {
  readonly id: string;
  readonly projectId: string;
  readonly artifactProposalId: string;
  readonly proseVersionId: string;
  readonly artifactType: string;
  readonly contentHash: string;
  readonly payload: JsonObject;
}

export interface PublishArtifactInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly artifactProposalId: string;
  readonly proseVersionId: string;
  readonly artifactType: string;
  readonly contentHash: string;
  readonly payload: JsonObject;
}

export interface ArtifactProposalRepo {
  findById(projectId: string, id: string): Promise<ArtifactProposalRecord | null>;
  /** CAS accepted from pending only; stale concurrent publish loses. */
  setAccepted(projectId: string, id: string): Promise<ArtifactProposalRecord | null>;
  listArtifacts(
    projectId: string,
    artifactProposalId: string,
  ): Promise<readonly PublishArtifactRecord[]>;
  insertArtifact(input: PublishArtifactInsertInput): Promise<PublishArtifactRecord>;
}
