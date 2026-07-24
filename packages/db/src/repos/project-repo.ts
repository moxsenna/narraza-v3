import { Prisma } from '../generated/client.js';
import type { ProjectRecord, ProjectRepo } from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  ownerUserId: true,
  title: true,
  intakePath: true,
  status: true,
  currentCanonicalVersion: true,
  revision: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof SELECT }>;

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    title: row.title,
    intakePath: row.intakePath,
    status: row.status,
    currentCanonicalVersion: row.currentCanonicalVersion,
    revision: row.revision,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createProjectRepo(tx: TxClient): ProjectRepo {
  return {
    async insert(input) {
      const row = await tx.project.create({
        data: {
          id: input.id,
          ownerUserId: input.ownerUserId,
          title: input.title,
          intakePath: input.intakePath,
          status: input.status,
        },
        select: SELECT,
      });
      return toRecord(row);
    },

    async findByIdForOwner(projectId, ownerUserId) {
      const row = await tx.project.findUnique({
        where: { id: projectId },
        select: SELECT,
      });
      if (!row || row.ownerUserId !== ownerUserId || row.deletedAt !== null) return null;
      return toRecord(row);
    },

    async listByOwner(ownerUserId) {
      const rows = await tx.project.findMany({
        where: { ownerUserId, deletedAt: null },
        select: SELECT,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toRecord);
    },

    async lockForUpdate(projectId) {
      const rows = (await tx.$queryRaw`
        SELECT id, owner_user_id, title, intake_path, status,
               current_canonical_version, revision, deleted_at,
               created_at, updated_at
          FROM projects
         WHERE id = ${projectId}
         FOR UPDATE`) as Array<RowShape>;
      const row = rows[0];
      if (!row) return null;
      return toRecord(rowToSelected(row));
    },

    async bumpCanonicalVersion(projectId, expectedVersion) {
      const rows = (await tx.$queryRaw`
        UPDATE projects
           SET current_canonical_version = current_canonical_version + 1,
               revision = revision + 1,
               updated_at = now()
         WHERE id = ${projectId}
           AND current_canonical_version = ${expectedVersion}
         RETURNING current_canonical_version`) as Array<{ current_canonical_version: number }>;
      const next = rows[0]?.current_canonical_version;
      return next === undefined ? null : next;
    },
  };
}

interface RowShape {
  id: string;
  owner_user_id: string;
  title: string;
  intake_path: string;
  status: string;
  current_canonical_version: number;
  revision: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToSelected(row: RowShape): ProjectRow {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    intakePath: row.intake_path,
    status: row.status,
    currentCanonicalVersion: row.current_canonical_version,
    revision: row.revision,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
