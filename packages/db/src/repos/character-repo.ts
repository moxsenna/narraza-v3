import { Prisma } from '../generated/client.js';
import type {
  CharacterRecord,
  CharacterRepo,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  projectId: true,
  displayName: true,
  role: true,
  revision: true,
  schemaVersion: true,
  payload: true,
  deletedAt: true,
} as const;

type CharacterRow = Prisma.CharacterGetPayload<{ select: typeof SELECT }>;

function toRecord(row: CharacterRow): CharacterRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    displayName: row.displayName,
    role: row.role,
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
    deletedAt: row.deletedAt,
  };
}

export function createCharacterRepo(tx: TxClient): CharacterRepo {
  return {
    async insert(input) {
      const row = await tx.character.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          displayName: input.displayName,
          role: input.role,
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
          : `AND revision = ${escapeLiteral(input.expectedRevision)}`;
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE characters
            SET display_name = $1,
                role = $2,
                payload = $3::jsonb,
                revision = revision + 1,
                updated_at = now()
          WHERE id = $4
            AND project_id = $5
            AND deleted_at IS NULL
            ${expectedClause}
          RETURNING id, project_id, display_name, role, revision, schema_version,
                   payload, deleted_at`,
        input.displayName,
        input.role,
        JSON.stringify(input.payload),
        input.id,
        input.projectId,
      )) as Array<RawCharacterRow>;
      const row = rows[0];
      return row ? toRecord(rawToSelected(row)) : null;
    },

    async findById(projectId, id) {
      const row = await tx.character.findUnique({
        where: { projectId, id },
        select: SELECT,
      });
      return row && row.deletedAt === null ? toRecord(row) : null;
    },

    async listByProject(projectId) {
      const rows = await tx.character.findMany({
        where: { projectId, deletedAt: null },
        select: SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },

    async softDelete(projectId, id, deletedAt) {
      const count = (await tx.$executeRaw`
        UPDATE characters
           SET deleted_at = ${deletedAt},
               updated_at = now()
         WHERE id = ${id}
           AND project_id = ${projectId}
           AND deleted_at IS NULL`) as unknown as number;
      return count > 0;
    },
  };
}

interface RawCharacterRow {
  id: string;
  project_id: string;
  display_name: string;
  role: string;
  revision: number;
  schema_version: number;
  payload: unknown;
  deleted_at: Date | null;
}

function rawToSelected(row: RawCharacterRow): CharacterRow {
  return {
    id: row.id,
    projectId: row.project_id,
    displayName: row.display_name,
    role: row.role,
    revision: row.revision,
    schemaVersion: row.schema_version,
    payload: row.payload as never,
    deletedAt: row.deleted_at,
  };
}

function escapeLiteral(value: number): string {
  return String(value);
}
