import { Prisma } from '../generated/client.js';
import type {
  IntakeMessageInsertInput,
  IntakeMessageRecord,
  IntakeRepo,
  IntakeSessionInsertInput,
  IntakeSessionRecord,
  JsonObject,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

const SESSION_SELECT = {
  id: true,
  projectId: true,
  status: true,
  signalCount: true,
  schemaVersion: true,
  payload: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  projectId: true,
  intakeSessionId: true,
  role: true,
  sequence: true,
  content: true,
  jobId: true,
  createdAt: true,
} as const;

type SessionRow = Prisma.IntakeSessionGetPayload<{ select: typeof SESSION_SELECT }>;
type MessageRow = Prisma.IntakeMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function sessionToRecord(row: SessionRow): IntakeSessionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    signalCount: row.signalCount,
    schemaVersion: row.schemaVersion,
    payload: row.payload as JsonObject,
  };
}

function messageToRecord(row: MessageRow): IntakeMessageRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    intakeSessionId: row.intakeSessionId,
    role: row.role,
    sequence: row.sequence,
    content: row.content,
    jobId: row.jobId,
    createdAt: row.createdAt,
  };
}

export function createIntakeRepo(tx: TxClient): IntakeRepo {
  return {
    async insertSession(input: IntakeSessionInsertInput): Promise<IntakeSessionRecord> {
      const row = await tx.intakeSession.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          status: input.status,
          signalCount: input.signalCount ?? 0,
          schemaVersion: input.schemaVersion ?? 1,
          payload: input.payload as never,
        },
        select: SESSION_SELECT,
      });
      return sessionToRecord(row);
    },

    async findSessionByProject(projectId): Promise<IntakeSessionRecord | null> {
      const row = await tx.intakeSession.findFirst({
        where: { projectId },
        select: SESSION_SELECT,
        orderBy: { createdAt: 'desc' },
      });
      return row ? sessionToRecord(row) : null;
    },

    async nextMessageSequence(projectId, intakeSessionId): Promise<number> {
      const rows = (await tx.$queryRaw`
        SELECT COALESCE(MAX(sequence), 0) AS max_seq
          FROM intake_messages
         WHERE project_id = ${projectId}
           AND intake_session_id = ${intakeSessionId}`) as Array<{ max_seq: string | number }>;
      const raw = rows[0]?.max_seq;
      const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
      return Number.isFinite(value) ? value + 1 : 1;
    },

    async insertMessage(input: IntakeMessageInsertInput): Promise<IntakeMessageRecord> {
      const row = await tx.intakeMessage.create({
        data: {
          id: input.id,
          projectId: input.projectId,
          intakeSessionId: input.intakeSessionId,
          role: input.role,
          sequence: input.sequence,
          content: input.content,
          jobId: input.jobId ?? null,
        },
        select: MESSAGE_SELECT,
      });
      return messageToRecord(row);
    },

    async listMessages(projectId, intakeSessionId): Promise<readonly IntakeMessageRecord[]> {
      const rows = await tx.intakeMessage.findMany({
        where: { projectId, intakeSessionId },
        select: MESSAGE_SELECT,
        orderBy: { sequence: 'asc' },
      });
      return rows.map(messageToRecord);
    },
  };
}
