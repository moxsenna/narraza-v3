import type { CreditReservationRecord, SystemFundedIntakePort } from '@narraza/application';
import { INTAKE_FAIR_USE_COUNTER_KIND } from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface RawReservationRow {
  id: string;
  user_id: string;
  project_id: string;
  job_project_id: string | null;
  job_id: string | null;
  status: CreditReservationRecord['status'];
  funding_model: CreditReservationRecord['fundingModel'];
  reserved_micro_idr: bigint | string;
  settled_micro_idr: bigint | string;
  released_micro_idr: bigint | string;
  exposure_micro_idr: bigint | string;
  closing_at: Date | null;
  quote_id: string | null;
  confirmation_request_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const RESERVATION_COLUMNS = `id,user_id,project_id,job_project_id,job_id,status,funding_model,
  reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,
  quote_id,confirmation_request_id,created_at,updated_at`;

function toRecord(row: RawReservationRow): CreditReservationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    projectJobId: row.job_project_id,
    jobId: row.job_id,
    status: row.status,
    fundingModel: row.funding_model,
    reservedMicroIdr: BigInt(row.reserved_micro_idr),
    settledMicroIdr: BigInt(row.settled_micro_idr),
    releasedMicroIdr: BigInt(row.released_micro_idr),
    exposureMicroIdr: BigInt(row.exposure_micro_idr),
    closingAt: row.closing_at,
    quoteId: row.quote_id,
    confirmationRequestId: row.confirmation_request_id,
    schemaVersion: 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSystemFundedIntakePort(tx: TxClient): SystemFundedIntakePort {
  return {
    async acceptDailyGeneration(input) {
      const rows = (await tx.$queryRawUnsafe(
        `WITH jakarta_day AS (
           SELECT
             ((now() AT TIME ZONE 'Asia/Jakarta')::date AT TIME ZONE 'Asia/Jakarta') AS starts_at,
             (((now() AT TIME ZONE 'Asia/Jakarta')::date + 1) AT TIME ZONE 'Asia/Jakarta') AS ends_at
         )
         INSERT INTO rate_limit_counters
           (id,kind,key_hash,window_starts_at,count,expires_at,updated_at)
         SELECT gen_random_uuid()::text,$1,$2,starts_at,1,ends_at,now()
           FROM jakarta_day
         ON CONFLICT (kind,key_hash,window_starts_at)
         DO UPDATE SET count = rate_limit_counters.count + 1, updated_at = now()
           WHERE rate_limit_counters.count < $3
         RETURNING count`,
        INTAKE_FAIR_USE_COUNTER_KIND,
        input.userId,
        input.limit,
      )) as Array<{ count: number }>;
      return rows[0]
        ? { kind: 'accepted' as const, count: Number(rows[0].count) }
        : { kind: 'limited' as const };
    },

    async createReservation(input) {
      const rows = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_reservations
           (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,
            released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,
            created_at,updated_at)
         VALUES ($1,$2,$3,'open','system_funded',$4,0,0,$4,NULL,NULL,$5,now(),now())
         ON CONFLICT (confirmation_request_id) DO NOTHING
         RETURNING ${RESERVATION_COLUMNS}`,
        input.id,
        input.userId,
        input.projectId,
        input.budgetMicroIdr,
        input.dedupeKey,
      )) as RawReservationRow[];
      return rows[0]
        ? { kind: 'created' as const, reservation: toRecord(rows[0]) }
        : { kind: 'conflict' as const };
    },
  };
}
