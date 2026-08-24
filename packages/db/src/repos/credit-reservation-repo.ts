import type {
  CreditReservationRecord,
  CreditReservationPort,
  CreateReservationInput,
  CreateReservationResult,
  ApplyReconciliationTargetInput,
  ReconciliationApplyResult,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';
import { deriveReservationStatus } from '@narraza/application';

const COLUMN_LIST = `id,user_id,project_id,job_project_id,job_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at`;

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
    status: row.status as 'open' | 'closing' | 'settled' | 'released' | 'cancelled' | 'expired',
    fundingModel: row.funding_model as 'user_paid' | 'system_funded' | null,
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

export function createCreditReservationRepo(tx: TxClient): CreditReservationPort {
  return {
    // Task 6: Find replay by confirmation request ID (unique constraint ensures single record)
    async findReplayByConfirmationRequestId(
      confirmationRequestId: string,
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
            exposure_micro_idr, closing_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5,
                 'open', 'user_paid', $6, 0, 0, $6, NULL, now(), now())
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

    async lockBound(input) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM credit_reservations
          WHERE id=$1 AND project_id=$2 AND job_project_id=$2 AND job_id=$3
          FOR UPDATE`,
        input.reservationId,
        input.projectId,
        input.jobId,
      )) as RawReservationRow[];
      return rows[0] ? toReservationRecord(rows[0]) : null;
    },

    // Blocker 2 & 3 & 4: Apply reconciliation targets using ABSOLUTE TARGETS + status derivation + exact binding validation
    async applyReconciliationTarget(
      input: ApplyReconciliationTargetInput,
    ): Promise<ReconciliationApplyResult> {
      const {
        reservationId,
        userId,
        projectId,
        jobProjectId,
        jobId,
        settledTargetMicroIdr: S_target,
        releasedTargetMicroIdr: L_target,
        exposureTargetMicroIdr: E_target,
        terminalReason,
      } = input;

      // Blocker I: Explicit negative target guards (must precede all SQL)
      if (S_target < 0n) {
        return {
          kind: 'conservation_violation',
          reason: 'settledTargetMicroIdr must be non-negative',
        };
      }
      if (L_target < 0n) {
        return {
          kind: 'conservation_violation',
          reason: 'releasedTargetMicroIdr must be non-negative',
        };
      }
      if (E_target < 0n) {
        return {
          kind: 'conservation_violation',
          reason: 'exposureTargetMicroIdr must be non-negative',
        };
      }

      // Step 1: Lock exact binding (Blocker 4 - project/job/user/reservation all match FOR UPDATE)
      const rows = (await tx.$queryRawUnsafe(
        `SELECT id,user_id,project_id,job_project_id,job_id,status,
                 reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at
           FROM credit_reservations
          WHERE id = $1
            AND user_id = $2
            AND project_id = $3
            AND job_project_id = $4
            AND job_id = $5
          FOR UPDATE`,
        reservationId,
        userId,
        projectId,
        jobProjectId,
        jobId,
      )) as Array<{
        id: string;
        user_id: string;
        project_id: string;
        job_project_id: string | null;
        job_id: string | null;
        status: string;
        reserved_micro_idr: bigint;
        settled_micro_idr: bigint;
        released_micro_idr: bigint;
        exposure_micro_idr: bigint;
        closing_at: Date | null;
      }>;

      if (rows.length === 0) {
        return { kind: 'not_found' };
      }

      const reservation = rows[0]!;

      // Validate binding (all four fields must match provided values - Blocker 4)
      if (
        reservation.user_id !== userId ||
        reservation.project_id !== projectId ||
        reservation.job_project_id !== jobProjectId ||
        reservation.job_id !== jobId
      ) {
        return { kind: 'binding_invalid' };
      }

      const S_current = reservation.settled_micro_idr;
      const L_current = reservation.released_micro_idr;

      // Blocker J: Explicit terminal lifecycle guard (must precede monotonicity)
      const currentStatus = reservation.status;
      const isTerminalCurrent = ['settled', 'released', 'cancelled', 'expired'].includes(
        currentStatus,
      );

      if (isTerminalCurrent) {
        // CRITICAL FIX per PM Directive Option 1:
        // Same S/L/E tuple but different disposition → terminal_disposition_mismatch
        // Different tuple from terminal → terminal_lifecycle_violation

        // Check for NO-OP first: exact same tuple with no terminalReason => allow as no-op
        const isSameTuple =
          S_target === S_current &&
          L_target === L_current &&
          E_target === reservation.exposure_micro_idr;

        if (terminalReason === undefined && isSameTuple) {
          // Exact no-op on terminal state => fall through to already_reconciled check later
          // No mutation needed, no conflict - let it proceed to Blocker H detection
        } else if (terminalReason !== undefined) {
          // terminalReason IS provided => compute desired status and check disposition mismatch
          const desiredStatus = deriveReservationStatus({
            settledTargetMicroIdr: S_target,
            releasedTargetMicroIdr: L_target,
            exposureTargetMicroIdr: E_target,
            terminalReason,
          });

          if (isSameTuple) {
            // Exact same tuple, but desired status differs => terminal disposition mismatch
            if (desiredStatus !== currentStatus) {
              return {
                kind: 'conflict',
                reason: 'terminal_disposition_mismatch' as const,
              };
            }
            // If desiredStatus === currentStatus, allow as no-op
          } else {
            // Non-identical tuple: check for lifecycle violations
            // Reopening to closing/open is rejected
            // Transition to another terminal disposition from different tuple is also rejected
            const isDesiredOpenOrClosing = desiredStatus === 'open' || desiredStatus === 'closing';
            const isAnotherTerminal = ['settled', 'released', 'cancelled', 'expired'].includes(
              desiredStatus,
            );

            if (isDesiredOpenOrClosing || (isTerminalCurrent && isAnotherTerminal)) {
              return {
                kind: 'conflict',
                reason: 'terminal_lifecycle_violation' as const,
              };
            }
          }
        } else {
          // No terminalReason but different tuple => check lifecycle
          const desiredStatus = deriveReservationStatus({
            settledTargetMicroIdr: S_target,
            releasedTargetMicroIdr: L_target,
            exposureTargetMicroIdr: E_target,
          });

          // Reopening to closing/open is rejected
          // Transition to another terminal disposition from different tuple is also rejected
          const isDesiredOpenOrClosing = desiredStatus === 'open' || desiredStatus === 'closing';
          const isAnotherTerminal = ['settled', 'released', 'cancelled', 'expired'].includes(
            desiredStatus,
          );

          if (isDesiredOpenOrClosing || (isTerminalCurrent && isAnotherTerminal)) {
            return {
              kind: 'conflict',
              reason: 'terminal_lifecycle_violation' as const,
            };
          }
        }
      }

      // Monotonicity checks (consistency law enforcement)
      if (S_target < S_current) {
        return { kind: 'monotonicity_violation', reason: 'settled' };
      }
      if (L_target < L_current) {
        return { kind: 'monotonicity_violation', reason: 'released' };
      }

      // Conservation law check (R = S + L + E always holds)
      const R = reservation.reserved_micro_idr;
      const newSum = S_target + L_target + E_target;
      if (newSum !== R) {
        return {
          kind: 'conservation_violation',
          reason: `sum ${S_target} + ${L_target} + ${E_target} = ${newSum} ≠ R=${R}`,
        };
      }

      // Blocker 3: Derive status from tuple using production function (not duplicated)
      const derivedStatus =
        /*重用 earlier computation if needed, but recompute for exactness*/ deriveReservationStatus(
          {
            settledTargetMicroIdr: S_target,
            releasedTargetMicroIdr: L_target,
            exposureTargetMicroIdr: E_target,
            ...(terminalReason !== undefined && { terminalReason }),
          },
        );

      // Exact replay check: compare proposed vs current (no-op if already at target)
      // Blocker H: For terminal tuples, also verify matching disposition
      const isSameTuple =
        S_target === S_current &&
        L_target === L_current &&
        E_target === reservation.exposure_micro_idr;
      if (isSameTuple) {
        // If current state is terminal and desired status differs, this is a terminal disposition mismatch
        const isTerminalCurrent = ['settled', 'released', 'cancelled', 'expired'].includes(
          reservation.status,
        );
        const isTerminalDesired = ['settled', 'released', 'cancelled', 'expired'].includes(
          derivedStatus,
        );

        if (isTerminalCurrent && isTerminalDesired && derivedStatus !== reservation.status) {
          // Same S/L/E but different terminal disposition => conflict (cannot change disposition without moving off tuple)
          return { kind: 'conflict', reason: 'terminal_disposition_mismatch' as const };
        }
        return { kind: 'already_reconciled' };
      }

      // Lifecycle coherence guard: never write status=open with closing_at non-null
      if (derivedStatus === 'open' && E_target === 0n) {
        return {
          kind: 'conservation_violation',
          reason: 'status=open requires E=R and closing_at=NULL',
        };
      }

      // Critical fix: COALESCE closing_at (only set once, preserve historical value)
      const closingAtClause = `COALESCE(closing_at, now())`;

      // Update ALL target fields AND status in ONE atomic operation (Blocker 3)
      await tx.$queryRawUnsafe(
        `UPDATE credit_reservations
           SET settled_micro_idr = $1,
               released_micro_idr = $2,
               exposure_micro_idr = $3,
               status = $4,
               closing_at = ${closingAtClause},
               updated_at = now()
         WHERE id = $5`,
        S_target,
        L_target,
        E_target,
        derivedStatus,
        reservationId,
      );

      return { kind: 'reconciled' };
    },
  };
}
