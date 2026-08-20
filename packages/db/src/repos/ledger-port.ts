import type {
  LedgerPort,
  ReleaseQueuedCancellationInput,
  ReleaseQueuedCancellationResult,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

interface ReservationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  job_project_id: string | null;
  job_id: string | null;
  status: string;
  reserved_micro_idr: bigint;
}

interface LedgerRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  reservation_id: string | null;
  entry_type: string;
  direction: string;
  amount_micro_idr: bigint;
  dedupe_key: string;
}

async function findExactRelease(
  tx: TxClient,
  input: ReleaseQueuedCancellationInput,
  reservation: ReservationRow,
): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT id,user_id,project_id,reservation_id,entry_type,direction,amount_micro_idr,dedupe_key
       FROM credit_ledger
      WHERE dedupe_key = $1`,
    input.dedupeKey,
  )) as LedgerRow[];
  const row = rows[0];
  return (
    row?.id === input.ledgerEntryId &&
    row.user_id === reservation.user_id &&
    row.project_id === input.projectId &&
    row.reservation_id === input.reservationId &&
    reservation.job_id === input.jobId &&
    row.entry_type === input.entryType &&
    row.direction === input.direction &&
    row.amount_micro_idr === reservation.reserved_micro_idr &&
    row.dedupe_key === input.dedupeKey
  );
}

export function createLedgerPort(tx: TxClient): LedgerPort {
  return {
    async releaseQueuedCancellation(
      input: ReleaseQueuedCancellationInput,
    ): Promise<ReleaseQueuedCancellationResult> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,user_id,project_id,job_project_id,job_id,status,reserved_micro_idr
           FROM credit_reservations
          WHERE id = $1
            AND project_id = $2
            AND job_project_id = $3
            AND job_id = $4
          FOR UPDATE`,
        input.reservationId,
        input.projectId,
        input.projectId,
        input.jobId,
      )) as ReservationRow[];
      const reservation = rows[0];
      if (
        !reservation ||
        reservation.project_id !== input.projectId ||
        reservation.job_project_id !== input.projectId ||
        reservation.job_id !== input.jobId
      ) {
        return { kind: 'binding_invalid' };
      }
      if (reservation.status === 'cancelled') {
        return (await findExactRelease(tx, input, reservation))
          ? { kind: 'already_released' }
          : { kind: 'binding_invalid' };
      }
      if (reservation.status !== 'open') return { kind: 'binding_invalid' };

      await tx.$queryRawUnsafe(
        `UPDATE credit_reservations
            SET status = 'cancelled', settled_micro_idr = 0,
                released_micro_idr = reserved_micro_idr, exposure_micro_idr = 0,
                closing_at = now(), updated_at = now()
          WHERE id = $1`,
        input.reservationId,
      );
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_ledger
           (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
            amount_micro_idr,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.ledgerEntryId,
        reservation.user_id,
        input.projectId,
        input.reservationId,
        input.entryType,
        input.direction,
        reservation.reserved_micro_idr,
        input.dedupeKey,
      )) as Array<{ id: string }>;
      if (inserted[0]) return { kind: 'released' };
      return (await findExactRelease(tx, input, reservation))
        ? { kind: 'already_released' }
        : { kind: 'binding_invalid' };
    },
  };
}
