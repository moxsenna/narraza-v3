import type { Prisma } from '../generated/client.js';
import type {
  ArtifactProposalRecord,
  ArtifactProposalRepo,
  JsonObject,
  PublishArtifactInsertInput,
  PublishArtifactRecord,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const PROPOSAL_SELECT = {
  id: true,
  projectId: true,
  proseVersionId: true,
  status: true,
  dependencyHash: true,
  sourceJobId: true,
  payload: true,
} as const;

const ARTIFACT_SELECT = {
  id: true,
  projectId: true,
  artifactProposalId: true,
  proseVersionId: true,
  artifactType: true,
  contentHash: true,
  payload: true,
} as const;

type ArtifactProposalRow = Prisma.ArtifactProposalGetPayload<{
  select: typeof PROPOSAL_SELECT;
}>;
type PublishArtifactRow = Prisma.PublishArtifactGetPayload<{
  select: typeof ARTIFACT_SELECT;
}>;

function artifactProposalToRecord(row: ArtifactProposalRow): ArtifactProposalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    proseVersionId: row.proseVersionId,
    status: row.status,
    dependencyHash: row.dependencyHash,
    sourceJobId: row.sourceJobId,
    payload: row.payload as JsonObject,
  };
}

function publishArtifactToRecord(row: PublishArtifactRow): PublishArtifactRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactProposalId: row.artifactProposalId,
    proseVersionId: row.proseVersionId,
    artifactType: row.artifactType,
    contentHash: row.contentHash,
    payload: row.payload as JsonObject,
  };
}

export function createArtifactProposalRepo(tx: TxClient): ArtifactProposalRepo {
  return {
    async findById(projectId, id): Promise<ArtifactProposalRecord | null> {
      const row = await tx.artifactProposal.findUnique({
        where: { projectId, id },
        select: PROPOSAL_SELECT,
      });
      return row ? artifactProposalToRecord(row) : null;
    },

    async setAccepted(projectId, id): Promise<ArtifactProposalRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE artifact_proposals
            SET status = 'accepted', updated_at = now()
          WHERE project_id = $1 AND id = $2 AND status = 'pending'
          RETURNING id, project_id AS "projectId", prose_version_id AS "proseVersionId",
                    status, dependency_hash AS "dependencyHash",
                    source_job_id AS "sourceJobId", payload`,
        projectId,
        id,
      )) as ArtifactProposalRow[];
      const row = rows[0];
      return row ? artifactProposalToRecord(row) : null;
    },

    async listArtifacts(projectId, artifactProposalId): Promise<readonly PublishArtifactRecord[]> {
      const rows = await tx.publishArtifact.findMany({
        where: { projectId, artifactProposalId },
        select: ARTIFACT_SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(publishArtifactToRecord);
    },

    async insertArtifact(input: PublishArtifactInsertInput): Promise<PublishArtifactRecord> {
      const row = await tx.publishArtifact.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          artifactProposalId: input.artifactProposalId,
          proseVersionId: input.proseVersionId,
          artifactType: input.artifactType,
          contentHash: input.contentHash,
          payload: input.payload as never,
        },
        select: ARTIFACT_SELECT,
      });
      return publishArtifactToRecord(row);
    },

    async countAcceptedByProject(projectId): Promise<number> {
      return tx.artifactProposal.count({ where: { projectId, status: 'accepted' } });
    },
  };
}
