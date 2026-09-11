import type { Prisma } from '../generated/client.js';
import type {
  ProposalGroupInsertInput,
  ProposalGroupRecord,
  ProposalGroupRepo,
  ProposalInsertInput,
  ProposalRecord,
  ProposalRepo,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  projectId: true,
  groupId: true,
  changeSetId: true,
  source: true,
  status: true,
  operationsHash: true,
  dependencyHash: true,
  revalidatedFromProposalId: true,
  validationReportId: true,
} as const;

type ProposalRow = Prisma.ProposalGetPayload<{ select: typeof SELECT }>;

function toRecord(row: ProposalRow): ProposalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    groupId: row.groupId,
    source: row.source,
    status: row.status,
    changeSetId: row.changeSetId,
    operationsHash: row.operationsHash,
    dependencyHash: row.dependencyHash,
    revalidatedFromProposalId: row.revalidatedFromProposalId,
    validationReportId: row.validationReportId,
  };
}

const GROUP_SELECT = {
  id: true,
  projectId: true,
  kind: true,
  status: true,
  dependencyHash: true,
  sourceJobId: true,
} as const;

type GroupRow = Prisma.ProposalGroupGetPayload<{ select: typeof GROUP_SELECT }>;

function groupToRecord(row: GroupRow): ProposalGroupRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    status: row.status,
    dependencyHash: row.dependencyHash,
    sourceJobId: row.sourceJobId,
  };
}

export function createProposalRepo(tx: TxClient): ProposalRepo {
  return {
    async insert(input: ProposalInsertInput): Promise<ProposalRecord> {
      if (!input.changeSetId) {
        throw new Error('proposalRepo.insert: changeSetId is required (M2 user-origin).');
      }
      const row = await tx.proposal.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          groupId: input.groupId,
          changeSetId: input.changeSetId,
          source: input.source,
          status: input.status,
          operationsHash: input.operationsHash,
          dependencyHash: input.dependencyHash,
          revalidatedFromProposalId: input.revalidatedFromProposalId ?? null,
          validationReportId: input.validationReportId ?? null,
        },
        select: SELECT,
      });
      return toRecord(row);
    },

    async findById(projectId, id): Promise<ProposalRecord | null> {
      const row = await tx.proposal.findUnique({
        where: { projectId, id },
        select: SELECT,
      });
      return row ? toRecord(row) : null;
    },

    async setStatus(projectId, id, expected, next): Promise<ProposalRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE proposals
            SET status = $4, updated_at = now()
          WHERE project_id = $1 AND id = $2 AND status = $3
          RETURNING id, project_id AS "projectId", group_id AS "groupId",
                    change_set_id AS "changeSetId", source, status,
                    operations_hash AS "operationsHash",
                    dependency_hash AS "dependencyHash",
                    revalidated_from_proposal_id AS "revalidatedFromProposalId",
                    validation_report_id AS "validationReportId"`,
        projectId,
        id,
        expected,
        next,
      )) as ProposalRow[];
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async listPendingInGroup(
      projectId,
      groupId,
      excludeId,
    ): Promise<readonly ProposalRecord[]> {
      const rows = await tx.proposal.findMany({
        where: { projectId, groupId, status: 'pending', id: { not: excludeId } },
        select: SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },
  };
}

export function createProposalGroupRepo(tx: TxClient): ProposalGroupRepo {
  return {
    async insert(input: ProposalGroupInsertInput): Promise<ProposalGroupRecord> {
      const row = await tx.proposalGroup.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          kind: input.kind,
          status: input.status,
          dependencyHash: input.dependencyHash,
          sourceJobId: input.sourceJobId ?? null,
        },
        select: GROUP_SELECT,
      });
      return groupToRecord(row);
    },

    async findById(projectId, id): Promise<ProposalGroupRecord | null> {
      const row = await tx.proposalGroup.findUnique({
        where: { projectId, id },
        select: GROUP_SELECT,
      });
      return row ? groupToRecord(row) : null;
    },

    async setStatus(projectId, id, expected, next): Promise<ProposalGroupRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE proposal_groups
            SET status = $4, updated_at = now()
          WHERE project_id = $1 AND id = $2 AND status = $3
          RETURNING id, project_id AS "projectId", kind, status,
                    dependency_hash AS "dependencyHash",
                    source_job_id AS "sourceJobId"`,
        projectId,
        id,
        expected,
        next,
      )) as GroupRow[];
      const row = rows[0];
      return row ? groupToRecord(row) : null;
    },

    async listPendingByProject(projectId): Promise<readonly ProposalGroupRecord[]> {
      const rows = await tx.proposalGroup.findMany({
        where: { projectId, status: 'pending' },
        select: GROUP_SELECT,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(groupToRecord);
    },
  };
}
