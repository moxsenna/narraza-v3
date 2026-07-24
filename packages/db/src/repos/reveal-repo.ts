import { Prisma } from '../generated/client.js';
import type {
  BreadcrumbInsertInput,
  JsonObject,
  RevealBreadcrumbRecord,
  RevealInsertInput,
  RevealRecord,
  RevealRepo,
  RevealUpdateInput,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const REVEAL_SELECT = {
  id: true,
  projectId: true,
  factId: true,
  chapterId: true,
  beatId: true,
  targetSequence: true,
  revision: true,
  payload: true,
} as const;

const BREADCRUMB_SELECT = {
  id: true,
  projectId: true,
  revealId: true,
  chapterId: true,
  beatId: true,
  sequence: true,
  payload: true,
} as const;

type RevealRow = Prisma.RevealGetPayload<{ select: typeof REVEAL_SELECT }>;
type BreadcrumbRow = Prisma.RevealBreadcrumbGetPayload<{ select: typeof BREADCRUMB_SELECT }>;

function revealToRecord(row: RevealRow): RevealRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    factId: row.factId,
    chapterId: row.chapterId,
    beatId: row.beatId,
    targetSequence: row.targetSequence,
    revision: row.revision,
    payload: row.payload as JsonObject,
  };
}

function breadcrumbToRecord(row: BreadcrumbRow): RevealBreadcrumbRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    revealId: row.revealId,
    chapterId: row.chapterId,
    beatId: row.beatId,
    sequence: row.sequence,
    payload: row.payload as JsonObject,
  };
}

export function createRevealRepo(tx: TxClient): RevealRepo {
  return {
    async insertReveal(input: RevealInsertInput): Promise<RevealRecord> {
      const row = await tx.reveal.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          factId: input.factId,
          chapterId: input.chapterId,
          beatId: input.beatId,
          targetSequence: input.targetSequence,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: REVEAL_SELECT,
      });
      return revealToRecord(row);
    },

    async updateReveal(input: RevealUpdateInput): Promise<RevealRecord | null> {
      const expectedClause =
        input.expectedRevision === null ? '' : `AND revision = ${String(input.expectedRevision)}`;
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE reveals
            SET chapter_id = $1,
                beat_id = $2,
                target_sequence = $3,
                payload = $4::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE id = $5 AND project_id = $6
          ${expectedClause}
         RETURNING id, project_id, fact_id, chapter_id, beat_id, target_sequence, revision, payload`,
        input.chapterId,
        input.beatId,
        input.targetSequence,
        JSON.stringify(input.payload),
        input.id,
        input.projectId,
      )) as Array<RevealRow>;
      const row = rows[0];
      return row ? revealToRecord(row) : null;
    },

    async findReveal(projectId, id) {
      const row = await tx.reveal.findUnique({
        where: { projectId, id },
        select: REVEAL_SELECT,
      });
      return row ? revealToRecord(row) : null;
    },

    async insertBreadcrumb(input: BreadcrumbInsertInput): Promise<RevealBreadcrumbRecord> {
      const row = await tx.revealBreadcrumb.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          revealId: input.revealId,
          chapterId: input.chapterId,
          beatId: input.beatId,
          sequence: input.sequence,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: BREADCRUMB_SELECT,
      });
      return breadcrumbToRecord(row);
    },

    async listByProject(projectId) {
      const [reveals, breadcrumbs] = await Promise.all([
        tx.reveal.findMany({
          where: { projectId },
          select: REVEAL_SELECT,
          orderBy: { targetSequence: 'asc' },
        }),
        tx.revealBreadcrumb.findMany({
          where: { projectId },
          select: BREADCRUMB_SELECT,
          orderBy: { sequence: 'asc' },
        }),
      ]);
      return {
        reveals: reveals.map(revealToRecord),
        breadcrumbs: breadcrumbs.map(breadcrumbToRecord),
      };
    },
  };
}
