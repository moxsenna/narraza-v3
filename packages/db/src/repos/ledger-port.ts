import type {
  LedgerPort,
  ReleaseQueuedCancellationInput,
  ReleaseQueuedCancellationResult,
  AppendReservationSettlementInput,
  ReservationSettlementAppendResult,
  AppendReservationReleaseInput,
  ReservationReleaseAppendResult,
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
  settled_micro_idr: bigint;
  released_micro_idr: bigint;
  exposure_micro_idr: bigint;
  closing_at: Date | null;
}

interface LedgerRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  reservation_id: string | null;
  attempt_id: string | null;
  entry_type: string;
  direction: string;
  amount_micro_idr: bigint;
  dedupe_key: string;
}

async function findExactSettlement(
  tx: TxClient,
  input: AppendReservationSettlementInput,
  // Partial reservation row for future binding validation if needed
  _reservation: { reserved_micro_idr: bigint; settled_micro_idr: bigint },
): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key
       FROM credit_ledger
      WHERE dedupe_key = $1`,
    input.dedupeKey,
  )) as LedgerRow[];
  const row = rows[0];
  return (
    row?.id === input.ledgerEntryId &&
    row.user_id === input.userId &&
    row.project_id === input.projectId &&
    row.reservation_id === input.reservationId &&
    row.attempt_id === input.attemptId &&
    row.entry_type === 'reservation_settlement' &&
    row.direction === 'debit' &&
    row.amount_micro_idr === input.amountMicroIdr &&
    row.dedupe_key === input.dedupeKey
  );
}

async function findExactRelease(
  tx: TxClient,
  input: AppendReservationReleaseInput,
  // Partial reservation row for future binding validation if needed
  _reservation: { reserved_micro_idr: bigint; settled_micro_idr: bigint },
): Promise<boolean> {
  const rows = (await tx.$queryRawUnsafe(
    `SELECT id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key
       FROM credit_ledger
      WHERE dedupe_key = $1`,
    input.dedupeKey,
  )) as LedgerRow[];
  const row = rows[0];
  if (!row) return false;

  // Validate full semantic tuple (Blocker 6 - EXACT REPLAY)
  if (
    row.id !== input.ledgerEntryId ||
    row.user_id !== input.userId ||
    row.project_id !== input.projectId ||
    row.reservation_id !== input.reservationId ||
    row.attempt_id !== input.attemptId ||
    row.entry_type !== 'release' ||
    row.direction !== 'credit' ||
    row.amount_micro_idr !== input.amountMicroIdr ||
    row.dedupe_key !== input.dedupeKey
  ) {
    return false;
  }

  return true;
}

export function createLedgerPort(tx: TxClient): LedgerPort {
  return {
    async releaseQueuedCancellation(
      input: ReleaseQueuedCancellationInput,
    ): Promise<ReleaseQueuedCancellationResult> {
      // CRITICAL FIX: Lock exact binding BEFORE checking for replay (binding-before-replay)
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,user_id,project_id,job_project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at
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

      if (rows.length === 0) {
        return { kind: 'binding_invalid' };
      }

      const reservation = rows[0]!;

      // Validate exact binding after lock
      if (
        reservation.project_id !== input.projectId ||
        reservation.job_project_id !== input.projectId ||
        reservation.job_id !== input.jobId
      ) {
        return { kind: 'binding_invalid' };
      }

      // Runtime dedupe key format validation - EXACT FORMAT CHECK
      // Format: release:{reservationId}:queued-cancel
      const expectedDedupeKey = `release:${input.reservationId}:queued-cancel`;
      if (input.dedupeKey !== expectedDedupeKey) {
        return { kind: 'binding_invalid' };
      }

      // Create full AppendReservationReleaseInput from reservation data
      const releaseInput: AppendReservationReleaseInput = {
        projectId: input.projectId,
        jobId: input.jobId,
        userId: reservation.user_id,
        reservationId: input.reservationId,
        ledgerEntryId: input.ledgerEntryId,
        reason: 'queued-cancel',
        attemptId: null,
        amountMicroIdr: reservation.reserved_micro_idr,
        dedupeKey: input.dedupeKey,
      };

      // Queued cancellation only works on open or already-cancelled reservations
      if (reservation.status === 'cancelled') {
        return (await findExactRelease(tx, releaseInput, reservation))
          ? { kind: 'already_released' }
          : { kind: 'binding_invalid' };
      }

      if (reservation.status !== 'open') {
        return { kind: 'binding_invalid' };
      }

      // Update reservation to cancelled terminal state with release semantics
      await tx.$queryRawUnsafe(
        `UPDATE credit_reservations
            SET status = 'cancelled', settled_micro_idr = 0,
                released_micro_idr = reserved_micro_idr, exposure_micro_idr = 0,
                closing_at = COALESCE(closing_at, now()), updated_at = now()
          WHERE id = $1`,
        input.reservationId,
      );

      // Insert release with CORRECT vocabulary: 'release'/'credit' (hardcoded, NOT from input)
      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_ledger
           (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
            amount_micro_idr,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,NULL,'release','credit',$5,$6,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.ledgerEntryId,
        reservation.user_id,
        input.projectId,
        input.reservationId,
        reservation.reserved_micro_idr,
        input.dedupeKey,
      )) as Array<{ id: string }>;

      if (inserted.length > 0) {
        return { kind: 'released' };
      }

      return (await findExactRelease(tx, releaseInput, reservation))
        ? { kind: 'already_released' }
        : { kind: 'binding_invalid' };
    },

    async appendReservationSettlement(
      input: AppendReservationSettlementInput,
    ): Promise<ReservationSettlementAppendResult> {
      // CRITICAL FIX: Lock exact binding BEFORE checking for replay (binding-before-replay)
      // This prevents accepting durable replay without validating reservation/job binding
      const reservationRows = (await tx.$queryRawUnsafe(
        `SELECT reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,status,closing_at
           FROM credit_reservations
          WHERE id = $1
            AND project_id = $2
            AND job_project_id = $3
            AND user_id = $4
            AND job_id = $5
          FOR UPDATE`,
        input.reservationId,
        input.projectId,
        input.projectId,
        input.userId,
        input.jobId,
      )) as Array<{
        reserved_micro_idr: bigint;
        settled_micro_idr: bigint;
        released_micro_idr: bigint;
        exposure_micro_idr: bigint;
        status: string;
        closing_at: Date | null;
      }>;

      if (reservationRows.length === 0) {
        return { kind: 'binding_invalid' };
      }

      const reservation = reservationRows[0]!;

      // Runtime dedupe key format validation - EXACT FORMAT CHECK
      // Format: settle:{reservationId}:{allocationId}
      const expectedDedupeKey = `settle:${input.reservationId}:${input.allocationId}`;
      if (input.dedupeKey !== expectedDedupeKey) {
        return { kind: 'binding_invalid' };
      }

      // Delta validation: negative amounts must be rejected BEFORE any DB write
      if (input.amountMicroIdr < 0n) {
        return { kind: 'dedupe_rejected' };
      }

      // Check for exact semantic replay AFTER locking (Blocker 6 - EXACT REPLAY)
      const existingRows = (await tx.$queryRawUnsafe(
        `SELECT id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key
           FROM credit_ledger
          WHERE dedupe_key = $1`,
        input.dedupeKey,
      )) as Array<{
        id: string;
        user_id: string | null;
        project_id: string | null;
        reservation_id: string | null;
        attempt_id: string | null;
        entry_type: string;
        direction: string;
        amount_micro_idr: bigint;
        dedupe_key: string;
      }>;

      if (existingRows.length > 0) {
        const existing = existingRows[0]!;

        // Full semantic validation (Blocker 6 - EXACT REPLAY)
        if (
          existing.id === input.ledgerEntryId &&
          existing.user_id === input.userId &&
          existing.project_id === input.projectId &&
          existing.reservation_id === input.reservationId &&
          existing.attempt_id === input.attemptId &&
          existing.entry_type === 'reservation_settlement' &&
          existing.direction === 'debit' &&
          existing.amount_micro_idr === input.amountMicroIdr &&
          existing.dedupe_key === input.dedupeKey
        ) {
          return { kind: 'already_settled' };
        }

        // Divergent replay (same dedupe key, different tuple) => binding_invalid
        // Note: this includes both larger and smaller proposed amounts compared to existing
        return { kind: 'binding_invalid' };
      }

      // Zero-delta handling: skip insert, return no-op success (Blocker 3 - delta semantics)
      if (input.amountMicroIdr === 0n) {
        return { kind: 'settled' };
      }

      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_ledger
           (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
            amount_micro_idr,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,$5,'reservation_settlement','debit',
            $6,$7,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.ledgerEntryId,
        input.userId,
        input.projectId,
        input.reservationId,
        input.attemptId,
        input.amountMicroIdr,
        input.dedupeKey,
      )) as Array<{ id: string }>;

      if (inserted.length > 0) {
        return { kind: 'settled' };
      }

      // Retry-unsafe but acceptable here because we checked above; still validate full replay
      return (await findExactSettlement(tx, input, reservation))
        ? { kind: 'already_settled' }
        : { kind: 'binding_invalid' };
    },

    async appendReservationRelease(
      input: AppendReservationReleaseInput,
    ): Promise<ReservationReleaseAppendResult> {
      // CRITICAL FIX: Lock exact binding BEFORE checking for replay (binding-before-replay)
      // This prevents accepting durable replay without validating reservation/job binding
      const reservationRows = (await tx.$queryRawUnsafe(
        `SELECT reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,status,closing_at
           FROM credit_reservations
          WHERE id = $1
            AND project_id = $2
            AND job_project_id = $3
            AND user_id = $4
            AND job_id = $5
          FOR UPDATE`,
        input.reservationId,
        input.projectId,
        input.projectId,
        input.userId,
        input.jobId,
      )) as Array<{
        reserved_micro_idr: bigint;
        settled_micro_idr: bigint;
        released_micro_idr: bigint;
        exposure_micro_idr: bigint;
        status: string;
        closing_at: Date | null;
      }>;

      if (reservationRows.length === 0) {
        return { kind: 'binding_invalid' };
      }

      const reservation = reservationRows[0]!;

      // Runtime dedupe key format validation - EXACT FORMAT CHECK BY REASON
      // Per PM directive: validate allocationId explicitly by reason (not just !== null)
      
      let expectedDedupeKey: string;
      switch (input.reason) {
        case 'invocation_completed':
        case 'cancellation_refund':
          // These reasons MUST have allocationId as non-empty string
          if (!input.allocationId || typeof input.allocationId !== 'string' || input.allocationId.trim() === '') {
            return { kind: 'binding_invalid' };
          }
          expectedDedupeKey = `release:${input.reservationId}:${input.reason}:${input.allocationId}`;
          break;
        
        case 'final-close':
          // This reason MUST NOT have allocationId (must be null/absent)
          if (input.allocationId !== null && input.allocationId !== undefined) {
            return { kind: 'binding_invalid' };
          }
          expectedDedupeKey = `release:${input.reservationId}:final-close`;
          break;
        
        case 'queued-cancel':
          // Frozen dedicated contract: no allocationId component, never create ":undefined"
          if (input.allocationId !== null && input.allocationId !== undefined) {
            return { kind: 'binding_invalid' };
          }
          expectedDedupeKey = `release:${input.reservationId}:queued-cancel`;
          break;
        
        default:
          // Unknown reason => reject
          return { kind: 'binding_invalid' };
      }

      if (input.dedupeKey !== expectedDedupeKey) {
        return { kind: 'binding_invalid' };
      }

      // Delta validation: negative amounts must be rejected BEFORE any DB write
      if (input.amountMicroIdr < 0n) {
        return { kind: 'dedupe_rejected' };
      }

      // Check for exact semantic replay AFTER locking (Blocker 6)
      const existingRows = (await tx.$queryRawUnsafe(
        `SELECT id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key
           FROM credit_ledger
          WHERE dedupe_key = $1`,
        input.dedupeKey,
      )) as Array<{
        id: string;
        user_id: string | null;
        project_id: string | null;
        reservation_id: string | null;
        attempt_id: string | null;
        entry_type: string;
        direction: string;
        amount_micro_idr: bigint;
        dedupe_key: string;
      }>;

      if (existingRows.length > 0) {
        const existing = existingRows[0]!;

        // Full semantic validation
        if (
          existing.id === input.ledgerEntryId &&
          existing.user_id === input.userId &&
          existing.project_id === input.projectId &&
          existing.reservation_id === input.reservationId &&
          existing.attempt_id === input.attemptId &&
          existing.entry_type === 'release' &&
          existing.direction === 'credit' &&
          existing.amount_micro_idr === input.amountMicroIdr &&
          existing.dedupe_key === input.dedupeKey
        ) {
          return { kind: 'already_released' };
        }

        // Divergent replay (same dedupe key, different tuple) => binding_invalid
        // Note: this includes both larger and smaller proposed amounts compared to existing
        return { kind: 'binding_invalid' };
      }

      // Zero-delta handling: skip insert (Blocker 3 - delta semantics)
      if (input.amountMicroIdr === 0n) {
        return { kind: 'released' };
      }

      const inserted = (await tx.$queryRawUnsafe(
        `INSERT INTO credit_ledger
           (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,
            amount_micro_idr,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,$5,'release','credit',
            $6,$7,now())
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        input.ledgerEntryId,
        input.userId,
        input.projectId,
        input.reservationId,
        input.attemptId,
        input.amountMicroIdr,
        input.dedupeKey,
      )) as Array<{ id: string }>;

      if (inserted.length > 0) {
        return { kind: 'released' };
      }

      return (await findExactRelease(tx, input, reservation))
        ? { kind: 'already_released' }
        : { kind: 'binding_invalid' };
    },
  };
}
