import { Prisma } from '../generated/client.js';
import type {
  FactRecord,
  FactRepo,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  projectId: true,
  factKey: true,
  canonStatus: true,
  visibility: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

type FactRow = Prisma.FactGetPayload<{ select: typeof SELECT }>;

function toRecord(row: FactRow): FactRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    factKey: row.factKey,
    canonStatus: row.canonStatus,
    visibility: row.visibility,
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

export function createFactRepo(tx: TxClient): FactRepo {
  return {
    async insert(input) {
      const row = await tx.fact.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          factKey: input.factKey,
          canonStatus: input.canonStatus,
          visibility: input.visibility,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: SELECT,
      });
      return toRecord(row);
    },

    async update(input) {
      const expectedClause =
        input.expectedRevision === null
          ? ''
          : `AND revision = ${String(input.expectedRevision)}`;
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE facts
            SET canon_status = $1,
                visibility = $2,
                payload = $3::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE id = $4
            AND project_id = $5
            AND deleted_at IS NULL
            ${expectedClause}
          RETURNING id, project_id, fact_key, canon_status, visibility, revision,
                   schema_version, payload, deleted_at`,
        input.canonStatus,
        input.visibility,
        JSON.stringify(input.payload),
        input.id,
        input.projectId,
      )) as Array<RawFactRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },

    async findById(projectId, id) {
      const row = await tx.fact.findUnique({
        where: { projectId, id },
        select: SELECT,
      });
      return row && row.deletedAt === null ? toRecord(row) : null;
    },

    async listByProject(projectId) {
      const rows = await tx.fact.findMany({
        where: { projectId, deletedAt: null },
        select: SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },
  };
}

interface RawFactRow {
  id: string;
  project_id: string;
  fact_key: string;
  canon_status: string;
  visibility: string;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}

function rawToSelected(row: RawFactRow): FactRow {
  return {
    id: row.id,
    projectId: row.project_id,
    factKey: row.fact_key,
    canonStatus: row.canon_status,
    visibility: row.visibility,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}
