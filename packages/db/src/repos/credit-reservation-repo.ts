import type { CreditReservationRecord, CreditReservationPort, CreateReservationInput, CreateReservationResult } from '@narraza/application';
import type { TxClient } from './tx-client.js';

const COLUMN_LIST = `id,user_id,project_id,job_project_id,job_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,schema_version,created_at,updated_at`;

interface RawReservationRow {
  id: string;
  user_id: string;
  project_id: string;
  job_project_id: string | null;
  job_id: string | null;
  status: string;
  funding_model: string | null;
  reserved_micro_idr: string | bigint;
  settled_micro_idr: string | bigint;
  released_micro_idr: string | bigint;
  exposure_micro_idr: string | bigint;
  closing_at: Date | null;
  quote_id: string | null;
  confirmation_request_id: string | null;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
}

function toReservationRecord(row: RawReservationRow): CreditReservationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    jobId: row.job_id,
    projectJobId: row.job_project_id,
    status: row.status as 'open' | 'closing' | 'settled' | 'released',
    fundingModel: row.funding_model as 'user_paid' | 'system_funded' | null,
    reservedMicroIdr: BigInt(row.reserved_micro_idr),
    settledMicroIdr: BigInt(row.settled_micro_idr),
    releasedMicroIdr: BigInt(row.released_micro_idr),
    exposureMicroIdr: BigInt(row.exposure_micro_idr),
    closingAt: row.closing_at,
    quoteId: row.quote_id,
    confirmationRequestId: row.confirmation_request_id,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCreditReservationRepo(tx: TxClient): CreditReservationPort {
  return {
    // Task 6: Find replay by confirmation request ID (unique constraint ensures single record)
    async findReplayByConfirmationRequestId(
      confirmationRequestId: string
    ): Promise<CreditReservationRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM credit_reservations
          WHERE confirmation_request_id = $1`,
        confirmationRequestId,
      )) as RawReservationRow[];
      
      const row = rows[0];
      return row ? toReservationRecord(row) : null;
    },
    
    // Task 6: Create open USER_PAID reservation
    async create(input: CreateReservationInput): Promise<CreateReservationResult> {
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_reservations
           (id, user_id, project_id, quote_id, confirmation_request_id,
            status, funding_model, reserved_micro_idr, settled_micro_idr, released_micro_idr,
            exposure_micro_idr, closing_at, schema_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 
                 'open', 'user_paid', $6, 0, 0, $6, NULL, 1, now(), now())
         ON CONFLICT (confirmation_request_id) DO NOTHING
         RETURNING ${COLUMN_LIST}`,
        input.id,
        input.userId,
        input.projectId,
        input.quoteId,
        input.confirmationRequestId,
        input.reservedMicroIdr,
      )) as RawReservationRow[];
      
      const row = inserted[0];
      if (row) {
        return { kind: 'created', reservation: toReservationRecord(row) };
      }
      
      // Check for concurrent conflict
      const concurrent = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM credit_reservations
          WHERE confirmation_request_id = $1`,
        input.confirmationRequestId,
      )) as RawReservationRow[];
      
      const concurrentRow = concurrent[0];
      if (concurrentRow) {
        return { kind: 'conflict' };
      }
      
      return { kind: 'conflict' };
    },
  };
}
