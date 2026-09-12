import type {
  JsonObject,
  M4ArtifactProposalView,
  M4CandidateGroupView,
  M4ConceptSetView,
  M4ProductReadPort,
  M4ProseVersionView,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * Read-only SQL adapter over the M4 product projection tables. Observation
 * only: every write path stays behind `m4ProductOutput` (fenced Tx C) and the
 * canonical change-set door. Newest-first ordering uses the row creation
 * timestamp with the id as deterministic tiebreaker.
 */

interface ConceptSetRow {
  id: string;
  status: string;
  source_job_id: string | null;
}

interface ConceptRow {
  id: string;
  ordinal: number;
  title: string;
  synopsis: string;
}

interface GroupRow {
  id: string;
  kind: string;
  status: string;
  source_job_id: string | null;
}

interface CandidateRow {
  id: string;
  ordinal: number;
  payload: JsonObject;
}

interface ArtifactRow {
  id: string;
  status: string;
  prose_version_id: string;
  source_job_id: string | null;
  payload: JsonObject;
}

interface ProseRow {
  id: string;
  beat_id: string;
  content: string;
}

export function createM4ProductReadPort(tx: TxClient): M4ProductReadPort {
  return {
    async findLatestConceptSet(projectId): Promise<M4ConceptSetView | null> {
      const sets = (await tx.$queryRawUnsafe(
        `SELECT id, status, source_job_id
           FROM concept_sets
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        projectId,
      )) as ConceptSetRow[];
      const set = sets[0];
      if (!set) return null;
      const concepts = (await tx.$queryRawUnsafe(
        `SELECT id, ordinal, title, synopsis
           FROM concepts
          WHERE project_id = $1 AND concept_set_id = $2
          ORDER BY ordinal ASC, id ASC`,
        projectId,
        set.id,
      )) as ConceptRow[];
      return {
        id: set.id,
        status: set.status,
        sourceJobId: set.source_job_id,
        concepts: concepts.map((row) => ({
          id: row.id,
          ordinal: row.ordinal,
          title: row.title,
          synopsis: row.synopsis,
        })),
      };
    },

    async findLatestCandidateGroup(projectId, kind): Promise<M4CandidateGroupView | null> {
      const groups = (await tx.$queryRawUnsafe(
        `SELECT id, kind, status, source_job_id
           FROM proposal_groups
          WHERE project_id = $1 AND kind = $2
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        projectId,
        kind,
      )) as GroupRow[];
      const group = groups[0];
      if (!group) return null;
      const candidates = (await tx.$queryRawUnsafe(
        `SELECT id, ordinal, payload
           FROM generated_candidates
          WHERE project_id = $1 AND group_id = $2
          ORDER BY ordinal ASC, id ASC`,
        projectId,
        group.id,
      )) as CandidateRow[];
      return {
        id: group.id,
        kind: group.kind,
        status: group.status,
        sourceJobId: group.source_job_id,
        candidates: candidates.map((row) => ({
          id: row.id,
          ordinal: row.ordinal,
          payload: row.payload,
        })),
      };
    },

    async findLatestArtifactProposal(projectId): Promise<M4ArtifactProposalView | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id, status, prose_version_id, source_job_id, payload
           FROM artifact_proposals
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        projectId,
      )) as ArtifactRow[];
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        proseVersionId: row.prose_version_id,
        sourceJobId: row.source_job_id,
        payload: row.payload,
      };
    },

    async findLatestProseVersion(projectId): Promise<M4ProseVersionView | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id, beat_id, content
           FROM prose_versions
          WHERE project_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        projectId,
      )) as ProseRow[];
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, beatId: row.beat_id, content: row.content };
    },
  };
}
