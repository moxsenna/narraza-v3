import type { Prisma } from '../generated/client.js';
import type {
  ConceptInsertInput,
  ConceptRecord,
  ConceptRepo,
  ConceptSetInsertInput,
  ConceptSetRecord,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SET_SELECT = {
  id: true,
  projectId: true,
  status: true,
  dependencyHash: true,
  schemaVersion: true,
  payload: true,
} as const;

const CONCEPT_SELECT = {
  id: true,
  projectId: true,
  conceptSetId: true,
  ordinal: true,
  title: true,
  synopsis: true,
  schemaVersion: true,
  payload: true,
} as const;

type SetRow = Prisma.ConceptSetGetPayload<{ select: typeof SET_SELECT }>;
type ConceptRow = Prisma.ConceptGetPayload<{ select: typeof CONCEPT_SELECT }>;

function setToRecord(row: SetRow): ConceptSetRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    dependencyHash: row.dependencyHash,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
  };
}

function conceptToRecord(row: ConceptRow): ConceptRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    conceptSetId: row.conceptSetId,
    ordinal: row.ordinal,
    title: row.title,
    synopsis: row.synopsis,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
  };
}

export function createConceptRepo(tx: TxClient): ConceptRepo {
  return {
    async insertSet(input: ConceptSetInsertInput): Promise<ConceptSetRecord> {
      const row = await tx.conceptSet.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          status: input.status,
          dependencyHash: input.dependencyHash,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: SET_SELECT,
      });
      return setToRecord(row);
    },

    async insertConcept(input: ConceptInsertInput): Promise<ConceptRecord> {
      const row = await tx.concept.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          conceptSetId: input.conceptSetId,
          ordinal: input.ordinal,
          title: input.title,
          synopsis: input.synopsis,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: CONCEPT_SELECT,
      });
      return conceptToRecord(row);
    },

    async findConcept(projectId, conceptId) {
      const row = await tx.concept.findUnique({
        where: { projectId, id: conceptId },
        select: CONCEPT_SELECT,
      });
      return row ? conceptToRecord(row) : null;
    },

    async findSet(projectId, conceptSetId) {
      const row = await tx.conceptSet.findUnique({
        where: { projectId, id: conceptSetId },
        select: SET_SELECT,
      });
      return row ? setToRecord(row) : null;
    },

    async markSetSelected(projectId, conceptSetId) {
      const rows = (await tx.$queryRaw`
        UPDATE concept_sets
           SET status = 'selected',
               updated_at = now()
         WHERE id = ${conceptSetId}
           AND project_id = ${projectId}
           AND status IN ('draft', 'generated', 'selected')
         RETURNING id, project_id, status, dependency_hash, schema_version, payload`) as Array<{
        id: string;
        project_id: string;
        status: string;
        dependency_hash: string;
        schema_version: number;
        payload: unknown;
      }>;
      const row = rows[0];
      if (!row) return null;
      return setToRecord({
        id: row.id,
        projectId: row.project_id,
        status: row.status,
        dependencyHash: row.dependency_hash,
        schemaVersion: row.schema_version,
        payload: row.payload as never,
      });
    },
  };
}
