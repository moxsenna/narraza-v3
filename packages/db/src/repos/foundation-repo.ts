import { Prisma } from '../generated/client.js';
import type {
  FoundationRecord,
  FoundationRepo,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  projectId: true,
  status: true,
  revision: true,
  confirmedAt: true,
  lockedAt: true,
  schemaVersion: true,
  payload: true,
} as const;

type FoundationRow = Prisma.FoundationGetPayload<{ select: typeof SELECT }>;

function toRecord(row: FoundationRow): FoundationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    revision: row.revision,
    confirmedAt: row.confirmedAt,
    lockedAt: row.lockedAt,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
  };
}

export function createFoundationRepo(tx: TxClient): FoundationRepo {
  return {
    async insert(input) {
      const row = await tx.foundation.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          status: input.status,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: SELECT,
      });
      return toRecord(row);
    },

    async findByProjectId(projectId) {
      const row = await tx.foundation.findUnique({
        where: { projectId },
        select: SELECT,
      });
      return row ? toRecord(row) : null;
    },

    async updateDraft(projectId, payload, expectedRevision) {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE foundations
            SET payload = $1::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE project_id = $2
            AND revision = $3
         RETURNING id, project_id, status, revision, confirmed_at, locked_at,
                  schema_version, payload`,
        JSON.stringify(payload),
        projectId,
        expectedRevision,
      )) as Array<RawFoundationRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },

    async markConfirmed(projectId, confirmedAt) {
      const rows = (await tx.$queryRaw`
        UPDATE foundations
           SET status = 'confirmed',
               confirmed_at = ${confirmedAt},
               revision = revision + 1,
               updated_at = now()
         WHERE project_id = ${projectId}
           AND status = 'draft'
         RETURNING id, project_id, status, revision, confirmed_at, locked_at,
                  schema_version, payload`) as Array<RawFoundationRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },

    async markLocked(projectId, lockedAt) {
      const rows = (await tx.$queryRaw`
        UPDATE foundations
           SET status = 'locked',
               locked_at = ${lockedAt},
               revision = revision + 1,
               updated_at = now()
         WHERE project_id = ${projectId}
           AND status = 'confirmed'
         RETURNING id, project_id, status, revision, confirmed_at, locked_at,
                  schema_version, payload`) as Array<RawFoundationRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },

    async applyUpdate(projectId, payload, expectedRevision) {
      const expectedClause =
        expectedRevision === null ? '' : `AND revision = ${String(expectedRevision)}`;
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE foundations
            SET payload = $1::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE project_id = $2
          ${expectedClause}
         RETURNING id, project_id, status, revision, confirmed_at, locked_at,
                  schema_version, payload`,
        JSON.stringify(payload),
        projectId,
      )) as Array<RawFoundationRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },
  };
}

interface RawFoundationRow {
  id: string;
  project_id: string;
  status: string;
  revision: number;
  confirmed_at: Date | null;
  locked_at: Date | null;
  schema_version: number;
  payload: unknown;
}

function rawToSelected(row: RawFoundationRow): FoundationRow {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    revision: row.revision,
    confirmedAt: row.confirmed_at,
    lockedAt: row.locked_at,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
  };
}
