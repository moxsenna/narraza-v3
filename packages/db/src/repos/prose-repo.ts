import type { Prisma } from '../generated/client.js';
import type {
  ProseDraftRepo,
  ProseVersionInsertInput,
  ProseVersionRecord,
  ProseVersionRepo,
  ProseWorkingDraftRecord,
  ProseDraftUpsertInput,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const DRAFT_SELECT = {
  id: true,
  projectId: true,
  beatId: true,
  userId: true,
  revision: true,
  content: true,
  contentHash: true,
} as const;

const VERSION_SELECT = {
  id: true,
  projectId: true,
  beatId: true,
  sourceCandidateId: true,
  status: true,
  revision: true,
  content: true,
  contentHash: true,
} as const;

type DraftRow = Prisma.ProseWorkingDraftGetPayload<{ select: typeof DRAFT_SELECT }>;
type VersionRow = Prisma.ProseVersionGetPayload<{ select: typeof VERSION_SELECT }>;

function toDraft(row: DraftRow): ProseWorkingDraftRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    beatId: row.beatId,
    userId: row.userId,
    revision: row.revision,
    content: row.content,
    contentHash: row.contentHash,
  };
}

function toVersion(row: VersionRow): ProseVersionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    beatId: row.beatId,
    sourceCandidateId: row.sourceCandidateId,
    status: row.status,
    revision: row.revision,
    content: row.content,
    contentHash: row.contentHash,
  };
}

export function createProseDraftRepo(tx: TxClient): ProseDraftRepo {
  return {
    async findActive(projectId, userId, beatId): Promise<ProseWorkingDraftRecord | null> {
      const row = await tx.proseWorkingDraft.findFirst({
        where: { projectId, userId, beatId, deletedAt: null },
        select: DRAFT_SELECT,
      });
      return row ? toDraft(row) : null;
    },

    async insert(input: ProseDraftUpsertInput): Promise<ProseWorkingDraftRecord> {
      const row = await tx.proseWorkingDraft.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          beatId: input.beatId,
          userId: input.userId,
          revision: 0,
          content: input.content,
          contentHash: input.contentHash,
        },
        select: DRAFT_SELECT,
      });
      return toDraft(row);
    },

    async updateContent(projectId, id, input): Promise<ProseWorkingDraftRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE prose_working_drafts
            SET content = $3,
                content_hash = $4,
                revision = revision + 1,
                updated_at = now()
          WHERE project_id = $1 AND id = $2 AND revision = $5 AND deleted_at IS NULL
          RETURNING id, project_id AS "projectId", beat_id AS "beatId",
                    user_id AS "userId", revision, content,
                    content_hash AS "contentHash"`,
        projectId,
        id,
        input.content,
        input.contentHash,
        input.expectedRevision,
      )) as DraftRow[];
      const row = rows[0];
      return row ? toDraft(row) : null;
    },

    async softDelete(projectId, id): Promise<void> {
      await tx.$executeRawUnsafe(
        `UPDATE prose_working_drafts
            SET deleted_at = now(), updated_at = now()
          WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
        projectId,
        id,
      );
    },
  };
}

export function createProseVersionRepo(tx: TxClient): ProseVersionRepo {
  return {
    async insert(input: ProseVersionInsertInput): Promise<ProseVersionRecord> {
      const row = await tx.proseVersion.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          beatId: input.beatId,
          sourceCandidateId: input.sourceCandidateId,
          status: input.status,
          revision: input.revision,
          content: input.content,
          contentHash: input.contentHash,
        },
        select: VERSION_SELECT,
      });
      return toVersion(row);
    },

    async findById(projectId, id): Promise<ProseVersionRecord | null> {
      const row = await tx.proseVersion.findUnique({
        where: { projectId, id },
        select: VERSION_SELECT,
      });
      return row ? toVersion(row) : null;
    },

    async maxRevision(projectId, beatId): Promise<number | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT MAX(revision) AS "maxRevision"
           FROM prose_versions
          WHERE project_id = $1 AND beat_id = $2`,
        projectId,
        beatId,
      )) as Array<{ maxRevision: number | null }>;
      return rows[0]?.maxRevision ?? null;
    },
  };
}
