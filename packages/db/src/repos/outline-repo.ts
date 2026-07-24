import { Prisma } from '../generated/client.js';
import type {
  JsonObject,
  OutlineNodeRecord,
  OutlineRepo,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const ROADMAP_SELECT = {
  id: true,
  projectId: true,
  title: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

const ARC_SELECT = {
  id: true,
  projectId: true,
  roadmapId: true,
  ordinal: true,
  title: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

const CHAPTER_SELECT = {
  id: true,
  projectId: true,
  arcId: true,
  ordinal: true,
  title: true,
  narrativeSequence: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

const BEAT_SELECT = {
  id: true,
  projectId: true,
  chapterId: true,
  ordinal: true,
  narrativeSequence: true,
  acceptedProseVersionId: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

type RoadmapRow = Prisma.RoadmapGetPayload<{ select: typeof ROADMAP_SELECT }>;
type ArcRow = Prisma.ArcGetPayload<{ select: typeof ARC_SELECT }>;
type ChapterRow = Prisma.ChapterGetPayload<{ select: typeof CHAPTER_SELECT }>;
type BeatRow = Prisma.BeatGetPayload<{ select: typeof BEAT_SELECT }>;

function roadmapToRecord(row: RoadmapRow): OutlineNodeRecord {
  return {
    entityType: 'roadmap',
    id: row.id,
    projectId: row.projectId,
    parentId: null,
    title: row.title,
    ordinal: null,
    narrativeSequence: null,
    revision: row.revision,
    acceptedProseVersionId: null,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

function arcToRecord(row: ArcRow): OutlineNodeRecord {
  return {
    entityType: 'arc',
    id: row.id,
    projectId: row.projectId,
    parentId: row.roadmapId,
    title: row.title,
    ordinal: row.ordinal,
    narrativeSequence: null,
    revision: row.revision,
    acceptedProseVersionId: null,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

function chapterToRecord(row: ChapterRow): OutlineNodeRecord {
  return {
    entityType: 'chapter',
    id: row.id,
    projectId: row.projectId,
    parentId: row.arcId,
    title: row.title,
    ordinal: row.ordinal,
    narrativeSequence: row.narrativeSequence,
    revision: row.revision,
    acceptedProseVersionId: null,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

function beatToRecord(row: BeatRow): OutlineNodeRecord {
  return {
    entityType: 'beat',
    id: row.id,
    projectId: row.projectId,
    parentId: row.chapterId,
    title: String((row.payload as { title?: unknown }).title ?? ''),
    ordinal: row.ordinal,
    narrativeSequence: row.narrativeSequence,
    revision: row.revision,
    acceptedProseVersionId: row.acceptedProseVersionId,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

export function createOutlineRepo(tx: TxClient): OutlineRepo {
  return {
    async insertNode(input) {
      if (input.entityType === 'roadmap') {
        const row = await tx.roadmap.create({
          data: {
            id: input.id,
            projectId: input.projectId,
            title: input.title,
            schemaVersion: input.schemaVersion ?? 1,
            payload: input.payload as never,
          },
          select: ROADMAP_SELECT,
        });
        return roadmapToRecord(row);
      }
      if (input.entityType === 'arc') {
        const row = await tx.arc.create({
          data: {
            id: input.id,
            projectId: input.projectId,
            roadmapId: input.parentId!,
            ordinal: input.ordinal ?? 0,
            title: input.title,
            schemaVersion: input.schemaVersion ?? 1,
            payload: input.payload as never,
          },
          select: ARC_SELECT,
        });
        return arcToRecord(row);
      }
      if (input.entityType === 'chapter') {
        const row = await tx.chapter.create({
          data: {
            id: input.id,
            projectId: input.projectId,
            arcId: input.parentId!,
            ordinal: input.ordinal ?? 0,
            title: input.title,
            narrativeSequence: input.narrativeSequence ?? 0,
            schemaVersion: input.schemaVersion ?? 1,
            payload: input.payload as never,
          },
          select: CHAPTER_SELECT,
        });
        return chapterToRecord(row);
      }
      // beat
      const row = await tx.beat.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          chapterId: input.parentId!,
          ordinal: input.ordinal ?? 0,
          narrativeSequence: input.narrativeSequence ?? 0,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: BEAT_SELECT,
      });
      return beatToRecord(row);
    },

    async updateNode(input) {
      const expectedClause =
        input.expectedRevision === null ? '' : `AND revision = ${String(input.expectedRevision)}`;
      if (input.entityType === 'roadmap') {
        const rows = (await tx.$queryRawUnsafe(
          `UPDATE roadmaps
              SET title = $1,
                  payload = $2::jsonb,
                  revision = revision + 1,
                  updated_at = now()
            WHERE id = $3 AND project_id = $4 AND deleted_at IS NULL
            ${expectedClause}
           RETURNING id, project_id, title, revision, schema_version, payload, deleted_at`,
          input.title,
          JSON.stringify(input.payload),
          input.id,
          input.projectId,
        )) as Array<RawRoadmapRow>;
        return rows[0] ? roadmapToRecord(rawRoadmap(rows[0])) : null;
      }
      if (input.entityType === 'arc') {
        const rows = (await tx.$queryRawUnsafe(
          `UPDATE arcs
              SET title = $1,
                  payload = $2::jsonb,
                  ordinal = COALESCE($3::int, ordinal),
                  revision = revision + 1,
                  updated_at = now()
            WHERE id = $4 AND project_id = $5 AND deleted_at IS NULL
            ${expectedClause}
           RETURNING id, project_id, roadmap_id, ordinal, title, revision, schema_version,
                    payload, deleted_at`,
          input.title,
          JSON.stringify(input.payload),
          input.ordinal ?? null,
          input.id,
          input.projectId,
        )) as Array<RawArcRow>;
        return rows[0] ? arcToRecord(rawArc(rows[0])) : null;
      }
      if (input.entityType === 'chapter') {
        const rows = (await tx.$queryRawUnsafe(
          `UPDATE chapters
              SET title = $1,
                  payload = $2::jsonb,
                  ordinal = COALESCE($3::int, ordinal),
                  narrative_sequence = COALESCE($4::int, narrative_sequence),
                  revision = revision + 1,
                  updated_at = now()
            WHERE id = $5 AND project_id = $6 AND deleted_at IS NULL
            ${expectedClause}
           RETURNING id, project_id, arc_id, ordinal, title, narrative_sequence, revision,
                    schema_version, payload, deleted_at`,
          input.title,
          JSON.stringify(input.payload),
          input.ordinal ?? null,
          input.narrativeSequence ?? null,
          input.id,
          input.projectId,
        )) as Array<RawChapterRow>;
        return rows[0] ? chapterToRecord(rawChapter(rows[0])) : null;
      }
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE beats
            SET payload = $1::jsonb,
                ordinal = COALESCE($2::int, ordinal),
                narrative_sequence = COALESCE($3::int, narrative_sequence),
                revision = revision + 1,
                updated_at = now()
          WHERE id = $4 AND project_id = $5 AND deleted_at IS NULL
          ${expectedClause}
         RETURNING id, project_id, chapter_id, ordinal, narrative_sequence,
                  accepted_prose_version_id, revision, schema_version, payload, deleted_at`,
        JSON.stringify(input.payload),
        input.ordinal ?? null,
        input.narrativeSequence ?? null,
        input.id,
        input.projectId,
      )) as Array<RawBeatRow>;
      return rows[0] ? beatToRecord(rawBeat(rows[0])) : null;
    },

    async findNode(projectId, entityType, id) {
      if (entityType === 'roadmap') {
        const row = await tx.roadmap.findUnique({
          where: { projectId, id },
          select: ROADMAP_SELECT,
        });
        return row && row.deletedAt === null ? roadmapToRecord(row) : null;
      }
      if (entityType === 'arc') {
        const row = await tx.arc.findUnique({
          where: { projectId, id },
          select: ARC_SELECT,
        });
        return row && row.deletedAt === null ? arcToRecord(row) : null;
      }
      if (entityType === 'chapter') {
        const row = await tx.chapter.findUnique({
          where: { projectId, id },
          select: CHAPTER_SELECT,
        });
        return row && row.deletedAt === null ? chapterToRecord(row) : null;
      }
      return this.findBeat(projectId, id);
    },

    async listByProject(projectId) {
      const [roadmaps, arcs, chapters, beats] = await Promise.all([
        tx.roadmap.findMany({ where: { projectId, deletedAt: null }, select: ROADMAP_SELECT, orderBy: { createdAt: 'asc' } }),
        tx.arc.findMany({ where: { projectId, deletedAt: null }, select: ARC_SELECT, orderBy: { ordinal: 'asc' } }),
        tx.chapter.findMany({ where: { projectId, deletedAt: null }, select: CHAPTER_SELECT, orderBy: { narrativeSequence: 'asc' } }),
        tx.beat.findMany({ where: { projectId, deletedAt: null }, select: BEAT_SELECT, orderBy: { narrativeSequence: 'asc' } }),
      ]);
      return [
        ...roadmaps.map(roadmapToRecord),
        ...arcs.map(arcToRecord),
        ...chapters.map(chapterToRecord),
        ...beats.map(beatToRecord),
      ];
    },

    async findBeat(projectId, beatId) {
      const row = await tx.beat.findUnique({
        where: { projectId, id: beatId },
        select: BEAT_SELECT,
      });
      return row && row.deletedAt === null ? beatToRecord(row) : null;
    },
  };
}

interface RawRoadmapRow {
  id: string;
  project_id: string;
  title: string;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}
function rawRoadmap(row: RawRoadmapRow): RoadmapRow {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}

interface RawArcRow {
  id: string;
  project_id: string;
  roadmap_id: string;
  ordinal: number;
  title: string;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}
function rawArc(row: RawArcRow): ArcRow {
  return {
    id: row.id,
    projectId: row.project_id,
    roadmapId: row.roadmap_id,
    ordinal: row.ordinal,
    title: row.title,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}

interface RawChapterRow {
  id: string;
  project_id: string;
  arc_id: string;
  ordinal: number;
  title: string;
  narrative_sequence: number;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}
function rawChapter(row: RawChapterRow): ChapterRow {
  return {
    id: row.id,
    projectId: row.project_id,
    arcId: row.arc_id,
    ordinal: row.ordinal,
    title: row.title,
    narrativeSequence: row.narrative_sequence,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}

interface RawBeatRow {
  id: string;
  project_id: string;
  chapter_id: string;
  ordinal: number;
  narrative_sequence: number;
  accepted_prose_version_id: string | null;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}
function rawBeat(row: RawBeatRow): BeatRow {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    ordinal: row.ordinal,
    narrativeSequence: row.narrative_sequence,
    acceptedProseVersionId: row.accepted_prose_version_id,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}

