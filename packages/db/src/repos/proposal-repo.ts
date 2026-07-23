import { Prisma } from '../generated/client.js';
import type { ProposalInsertInput, ProposalRecord, ProposalRepo } from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SELECT = {
  id: true,
  projectId: true,
  groupId: true,
  changeSetId: true,
  source: true,
  status: true,
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
          operationsHash: '',
          dependencyHash: '',
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
  };
}
