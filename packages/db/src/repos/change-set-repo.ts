import { Prisma } from '../generated/client.js';
import type {
  CanonicalChangeOperationRecord,
  CanonicalChangeSetRecord,
  ChangeOperationInsertInput,
  ChangeSetInsertInput,
  ChangeSetRepo,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SET_SELECT = {
  id: true,
  projectId: true,
  origin: true,
  status: true,
  baseCanonicalVersion: true,
  operationsHash: true,
  appliedCanonicalVersion: true,
} as const;

const OP_SELECT = {
  id: true,
  projectId: true,
  changeSetId: true,
  ordinal: true,
  operationType: true,
  targetEntityType: true,
  targetEntityId: true,
  expectedRevision: true,
  risk: true,
  schemaVersion: true,
  payload: true,
} as const;

type ChangeSetRow = Prisma.CanonicalChangeSetGetPayload<{ select: typeof SET_SELECT }>;
type ChangeOpRow = Prisma.CanonicalChangeOperationGetPayload<{ select: typeof OP_SELECT }>;

function setToRecord(row: ChangeSetRow): CanonicalChangeSetRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    origin: row.origin,
    status: row.status,
    baseCanonicalVersion: row.baseCanonicalVersion,
    operationsHash: row.operationsHash,
    appliedCanonicalVersion: row.appliedCanonicalVersion,
  };
}

function opToRecord(row: ChangeOpRow): CanonicalChangeOperationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    changeSetId: row.changeSetId,
    ordinal: row.ordinal,
    operationType: row.operationType,
    targetEntityType: row.targetEntityType,
    targetEntityId: row.targetEntityId,
    expectedRevision: row.expectedRevision,
    risk: row.risk,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
  };
}

export function createChangeSetRepo(tx: TxClient): ChangeSetRepo {
  return {
    async insertPending(input: ChangeSetInsertInput): Promise<CanonicalChangeSetRecord> {
      const row = await tx.canonicalChangeSet.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          origin: input.origin,
          status: input.status,
          baseCanonicalVersion: input.baseCanonicalVersion,
          operationsHash: input.operationsHash,
        },
        select: SET_SELECT,
      });
      return setToRecord(row);
    },

    async insertOperations(ops: readonly ChangeOperationInsertInput[]) {
      const rows: CanonicalChangeOperationRecord[] = [];
      for (const op of ops) {
        const row = await tx.canonicalChangeOperation.create({
          data: {
            id: op.id,
            projectId: op.projectId,
            changeSetId: op.changeSetId,
            ordinal: op.ordinal,
            operationType: op.operationType,
            targetEntityType: op.targetEntityType,
            targetEntityId: op.targetEntityId,
            expectedRevision: op.expectedRevision,
            risk: op.risk,
            schemaVersion: op.schemaVersion ?? 1,
            payload: op.payload as never,
          },
          select: OP_SELECT,
        });
        rows.push(opToRecord(row));
      }
      return rows;
    },

    async markApplied(projectId, changeSetId, appliedCanonicalVersion) {
      const rows = (await tx.$queryRaw`
        UPDATE canonical_change_sets
           SET status = 'applied',
               applied_canonical_version = ${appliedCanonicalVersion},
               updated_at = now()
         WHERE id = ${changeSetId}
           AND project_id = ${projectId}
           AND status = 'pending'
         RETURNING id, project_id, origin, status, base_canonical_version,
                  operations_hash, applied_canonical_version`) as Array<RawSetRow>;
      const row = rows[0];
      return row ? setToRecord(rawSet(row)) : null;
    },

    async findById(projectId, changeSetId) {
      const row = await tx.canonicalChangeSet.findUnique({
        where: { projectId, id: changeSetId },
        select: SET_SELECT,
      });
      return row ? setToRecord(row) : null;
    },
  };
}

interface RawSetRow {
  id: string;
  project_id: string;
  origin: string;
  status: string;
  base_canonical_version: number;
  operations_hash: string;
  applied_canonical_version: number | null;
}
function rawSet(row: RawSetRow): ChangeSetRow {
  return {
    id: row.id,
    projectId: row.project_id,
    origin: row.origin,
    status: row.status,
    baseCanonicalVersion: row.base_canonical_version,
    operationsHash: row.operations_hash,
    appliedCanonicalVersion: row.applied_canonical_version,
  };
}
