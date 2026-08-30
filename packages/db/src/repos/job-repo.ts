import type {
  GenerationJobRecord,
  GenerationJobStatus,
  JobFencedLockResult,
  JobHeartbeatInput,
  JobHeartbeatResult,
  JobInsertInput,
  JobInsertResult,
  JobClaimInput,
  JobClaimResult,
  JobCancelQueuedResult,
  JobLeaseIdentity,
  JobLiveOwnerLockResult,
  JobLookupInput,
  JobQueuedTerminalInput,
  JobReclaimInput,
  JobReclaimResult,
  JobRequeueInput,
  JobRequeueResult,
  JobRunningCancellationResult,
  JobRunningTerminalInput,
  JobTerminalTransitionResult,
  JobPort,
  JsonObject,
  TerminalJobStatus,
} from '@narraza/application';
import type { TxClient } from './tx-client.js';

/**
 * JobPort adapter bound to the `generation_jobs` table. Every operation runs
 * through `$queryRawUnsafe` and canonicalizes to the final `JobPort` contract:
 *
 *   - Insert and operational timestamps come from the PostgreSQL clock via
 *     `now()` plus numeric `INTERVAL` math, never from Node-side `Date` values.
 *   - Lease ownership is a compare-and-set on `(project_id, id, lease_token,
 *     fence_version, status)`; no double-decrement of provenance.
 *   - `fence_version` rises strictly inside SQL (`fence_version + 1`) so two
 *     concurrent fenced transitions cannot both observe the same value.
 *   - `claimNext` and `reclaimNextExpired` use a single CTE with
 *     `SKIP LOCKED` over the partial lifecycle indexes.
 *   - `23505` / `23503` SQLSTATE surface as typed outcomes, never as thrown
 *     errors that reach use-case callers.
 *
 * The adapter returns the canonical `GenerationJobRecord` (camelCase) via a
 * single `toRecord` mapper fed by every `RETURNING` clause.
 */

const COLUMN_LIST = `id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,
       fence_version,cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,reservation_id,
       schema_version,payload,created_at,updated_at`;

const QUALIFIED_COLUMN_LIST = COLUMN_LIST.split(',')
  .map((column) => `generation_jobs.${column.trim()}`)
  .join(',');

interface RawRow {
  id: string;
  project_id: string;
  kind: string;
  status: GenerationJobStatus;
  priority: number;
  available_at: Date;
  lease_token: string | null;
  lease_expires_at: Date | null;
  fence_version: number;
  cancel_requested_at: Date | null;
  retry_of_job_id: string | null;
  bundle_id: string | null;
  workflow_plan_id: string | null;
  reservation_id: string | null;
  schema_version: number;
  payload: unknown;
  created_at: Date;
  updated_at: Date;
}

/** Single snake_case -> camelCase mapper shared by every operation. */
function toRecord(row: RawRow): GenerationJobRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    availableAt: row.available_at,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    fenceVersion: row.fence_version,
    cancelRequestedAt: row.cancel_requested_at,
    retryOfJobId: row.retry_of_job_id,
    bundleId: row.bundle_id,
    workflowPlanId: row.workflow_plan_id,
    reservationId: row.reservation_id,
    schemaVersion: row.schema_version,
    payload: row.payload as JsonObject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TERMINAL_STATUSES: readonly GenerationJobStatus[] = [
  'succeeded',
  'failed',
  'dead',
  'cancelled',
];

function isTerminalStatus(status: string | null | undefined): boolean {
  return (
    status !== null &&
    status !== undefined &&
    (TERMINAL_STATUSES as readonly string[]).includes(status)
  );
}

export function createJobRepo(tx: TxClient): JobPort {
  return {
    async insert(input: JobInsertInput): Promise<JobInsertResult> {
      if (input.reservationId !== null) {
        // Funding binding integrity (PM Amendment #16): the reservation's
        // persisted funding_model must match the job's funding classification.
        // 'pre_d4_legacy' binds only NULL (legacy) reservations; new D4 paths
        // never create NULL rows. Mismatches fail closed before any write.
        const expectedFundingModel =
          input.fundingModel === 'pre_d4_legacy' ? null : input.fundingModel;
        const eligible = (await tx.$queryRawUnsafe(
          `SELECT id, funding_model FROM credit_reservations
            WHERE id = $1 AND project_id = $2 AND status = 'open'
              AND job_id IS NULL AND job_project_id IS NULL
              AND funding_model IS NOT DISTINCT FROM $3::text
            FOR UPDATE`,
          input.reservationId,
          input.projectId,
          expectedFundingModel,
        )) as Array<{ id: string; funding_model: string | null }>;
        if (!eligible[0]) {
          // Distinguish a funding mismatch from other binding failures so the
          // typed surface stays observable; both write nothing.
          const anyOpen = (await tx.$queryRawUnsafe(
            `SELECT funding_model FROM credit_reservations
              WHERE id = $1 AND project_id = $2 AND status = 'open'
                AND job_id IS NULL AND job_project_id IS NULL`,
            input.reservationId,
            input.projectId,
          )) as Array<{ funding_model: string | null }>;
          return anyOpen[0] ? { kind: 'funding_model_mismatch' } : { kind: 'binding_invalid' };
        }
      }

      const rows = (await tx.$queryRawUnsafe(
        `INSERT INTO generation_jobs
           (id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,
            fence_version,cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,
            reservation_id,schema_version,payload,created_at,updated_at)
         VALUES ($1,$2,$3,'queued',$4,
                 now() + ($5::bigint * INTERVAL '1 millisecond'),NULL,NULL,
                 0,NULL,$6,$7,$8,NULLIF($9::text,$9::text),$10,$11::jsonb,now(),now())
         ON CONFLICT DO NOTHING
         RETURNING ${COLUMN_LIST}`,
        input.id,
        input.projectId,
        input.kind,
        input.priority,
        BigInt(input.availableInMs),
        input.retryOfJobId,
        input.bundleId,
        input.workflowPlanId,
        input.reservationId,
        input.schemaVersion,
        JSON.stringify(input.payload),
      )) as RawRow[];
      const row = rows[0];
      if (!row) return { kind: 'conflict' };
      if (input.reservationId === null) return { kind: 'inserted', job: toRecord(row) };

      const bound = (await tx.$queryRawUnsafe(
        `WITH reservation AS (
           UPDATE credit_reservations
              SET job_project_id = $2, job_id = $3, updated_at = now()
            WHERE id = $1 AND project_id = $2 AND status = 'open'
              AND job_id IS NULL AND job_project_id IS NULL
            RETURNING id
         )
         UPDATE generation_jobs
            SET reservation_id = reservation.id, updated_at = now()
           FROM reservation
          WHERE generation_jobs.project_id = $2 AND generation_jobs.id = $3
          RETURNING ${QUALIFIED_COLUMN_LIST}`,
        input.reservationId,
        input.projectId,
        input.id,
      )) as RawRow[];
      const reciprocal = bound[0];
      if (!reciprocal) return { kind: 'binding_invalid' };
      return { kind: 'inserted', job: toRecord(reciprocal) };
    },

    async findById(input: JobLookupInput): Promise<GenerationJobRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2`,
        input.projectId,
        input.jobId,
      )) as RawRow[];
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async listActiveByProject(projectId: string): Promise<readonly GenerationJobRecord[]> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND status IN ('queued','running')
          ORDER BY available_at ASC, priority DESC, created_at ASC, id ASC`,
        projectId,
      )) as RawRow[];
      return rows.map(toRecord);
    },

    async findLatestTerminalByProject(input: {
      projectId: string;
      kind: string;
      payloadFilter: JsonObject;
    }): Promise<GenerationJobRecord | null> {
      // Payload eligibility filters BEFORE ordering/limit so the latest
      // terminal job is always selected within the requested payload scope.
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1
            AND kind = $2
            AND status IN ('succeeded','failed','dead','cancelled')
            AND payload @> $3::jsonb
          ORDER BY updated_at DESC, id DESC
          LIMIT 1`,
        input.projectId,
        input.kind,
        JSON.stringify(input.payloadFilter),
      )) as RawRow[];
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async lockForUpdate(input: JobLookupInput): Promise<GenerationJobRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2
          FOR UPDATE`,
        input.projectId,
        input.jobId,
      )) as RawRow[];
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async lockForReconciliation(input: JobLookupInput): Promise<GenerationJobRecord | null> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2
          FOR UPDATE`,
        input.projectId,
        input.jobId,
      )) as RawRow[];
      const row = rows[0];
      return row ? toRecord(row) : null;
    },

    async claimNext(input: JobClaimInput): Promise<JobClaimResult> {
      // Single CTE: lock one candidate row with SKIP LOCKED, then atomically
      // flip it to running with a live lease and an incremented fence.
      const rows = (await tx.$queryRawUnsafe(
        `WITH candidate AS (
            SELECT id FROM generation_jobs
             WHERE status = 'queued'
               AND available_at <= now()
             ORDER BY available_at ASC, priority DESC, created_at ASC, id ASC
             FOR UPDATE OF generation_jobs SKIP LOCKED
             LIMIT 1
           ),
           claimed AS (
             UPDATE generation_jobs
                SET status = 'running',
                    lease_token = $1,
                    lease_expires_at = clock_timestamp() + ($2::bigint * INTERVAL '1 millisecond'),
                    fence_version = fence_version + 1,
                    updated_at = now()
              FROM candidate
             WHERE generation_jobs.id = candidate.id
             RETURNING ${QUALIFIED_COLUMN_LIST}
           )
         SELECT * FROM claimed`,
        input.leaseToken,
        BigInt(input.leaseDurationMs),
      )) as RawRow[];
      const row = rows[0];
      if (!row) return { kind: 'none' };
      const job = toRecord(row);
      const identity: JobLeaseIdentity = {
        projectId: job.projectId,
        jobId: job.id,
        leaseToken: job.leaseToken ?? '',
        fenceVersion: job.fenceVersion,
      };
      return { kind: 'claimed', job, identity };
    },

    async heartbeat(input: JobHeartbeatInput): Promise<JobHeartbeatResult> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET lease_expires_at = clock_timestamp() + ($4::bigint * INTERVAL '1 millisecond'),
                updated_at = now()
          WHERE project_id = $1 AND id = $2
            AND lease_token = $3 AND fence_version = $5
            AND status = 'running'
            AND lease_expires_at > clock_timestamp()
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
        input.leaseToken,
        BigInt(input.leaseDurationMs),
        input.fenceVersion,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'extended', job: toRecord(row) } : { kind: 'lost_ownership' };
    },

    async requestRunningCancellation(input: JobLookupInput): Promise<JobRunningCancellationResult> {
      const updated = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET cancel_requested_at = now(), updated_at = now()
          WHERE project_id = $1 AND id = $2
            AND status = 'running' AND cancel_requested_at IS NULL
        RETURNING id`,
        input.projectId,
        input.jobId,
      )) as Array<{ id: string }>;
      if (updated[0]) return { kind: 'requested' };

      const current = (await tx.$queryRawUnsafe(
        `SELECT status, cancel_requested_at FROM generation_jobs
          WHERE project_id = $1 AND id = $2
          FOR UPDATE`,
        input.projectId,
        input.jobId,
      )) as Array<{ status: string; cancel_requested_at: Date | null }>;
      const row = current[0];
      return row?.status === 'running' && row.cancel_requested_at !== null
        ? { kind: 'already_requested' }
        : { kind: 'state_conflict' };
    },

    async cancelQueued(input: JobLookupInput): Promise<JobCancelQueuedResult> {
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET status = 'cancelled',
                updated_at = now()
          WHERE project_id = $1 AND id = $2
            AND status = 'queued'
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'cancelled', job: toRecord(row) } : { kind: 'state_conflict' };
    },

    async requeueRunning(input: JobRequeueInput): Promise<JobRequeueResult> {
      // Requeue only a running lease whose cancellation has NOT been requested
      // — the cancel-requested running jobs funnel through reclaimNextExpired
      // so the lease clearing and fence increment pair atomically with the
      // publication decision.
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET status = 'queued',
                available_at = now() + ($5::bigint * INTERVAL '1 millisecond'),
                lease_token = NULL,
                lease_expires_at = NULL,
                fence_version = fence_version + 1,
                updated_at = now()
          WHERE project_id = $1 AND id = $2
            AND lease_token = $3 AND fence_version = $4
            AND status = 'running'
            AND lease_expires_at > clock_timestamp()
            AND cancel_requested_at IS NULL
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
        input.leaseToken,
        input.fenceVersion,
        BigInt(input.delayMs),
      )) as RawRow[];
      const row = rows[0];
      if (row) return { kind: 'requeued', job: toRecord(row) };

      // Either lost ownership, or the row exists but cancel was requested.
      const current = (await tx.$queryRawUnsafe(
        `SELECT status, lease_token, lease_expires_at, fence_version, cancel_requested_at,
                lease_expires_at > clock_timestamp() AS lease_is_live
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2`,
        input.projectId,
        input.jobId,
      )) as Array<{
        status: GenerationJobStatus;
        lease_token: string | null;
        lease_expires_at: Date | null;
        fence_version: number;
        cancel_requested_at: Date | null;
        lease_is_live: boolean;
      }>;
      const snap = current[0];
      if (!snap) return { kind: 'lost_ownership' };
      if (snap.status !== 'running') return { kind: 'lost_ownership' };
      if (
        snap.lease_token !== input.leaseToken ||
        snap.fence_version !== input.fenceVersion ||
        !snap.lease_is_live
      ) {
        return { kind: 'lost_ownership' };
      }
      return { kind: 'not_allowed' };
    },

    async transitionQueuedToTerminal(
      input: JobQueuedTerminalInput,
    ): Promise<JobTerminalTransitionResult> {
      // Queued terminal transition: only 'cancelled' is legal; the row must be
      // in 'queued' (lease columns already NULL, satisfying lease_check).
      const existing = (await tx.$queryRawUnsafe(
        `SELECT status FROM generation_jobs WHERE project_id = $1 AND id = $2`,
        input.projectId,
        input.jobId,
      )) as Array<{ status: GenerationJobStatus }>;
      const snap = existing[0];
      if (!snap) return { kind: 'lost_ownership' };
      if (isTerminalStatus(snap.status)) {
        return { kind: 'already_terminal', status: snap.status as TerminalJobStatus };
      }
      if (snap.status !== 'queued') return { kind: 'lost_ownership' };

      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET status = $3, updated_at = now()
          WHERE project_id = $1 AND id = $2 AND status = 'queued'
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
        input.status,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'terminalized', job: toRecord(row) } : { kind: 'lost_ownership' };
    },

    async transitionRunningToTerminal(
      input: JobRunningTerminalInput,
    ): Promise<JobTerminalTransitionResult> {
      const existing = (await tx.$queryRawUnsafe(
        `SELECT status, lease_token, fence_version, cancel_requested_at,
                lease_expires_at > clock_timestamp() AS lease_is_live
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2`,
        input.projectId,
        input.jobId,
      )) as Array<{
        status: GenerationJobStatus;
        lease_token: string | null;
        fence_version: number;
        cancel_requested_at: Date | null;
        lease_is_live: boolean;
      }>;
      const snap = existing[0];
      if (!snap) return { kind: 'lost_ownership' };
      if (isTerminalStatus(snap.status)) {
        return { kind: 'already_terminal', status: snap.status as TerminalJobStatus };
      }
      if (snap.status !== 'running') return { kind: 'lost_ownership' };
      if (
        snap.lease_token !== input.leaseToken ||
        snap.fence_version !== input.fenceVersion ||
        !snap.lease_is_live
      ) {
        return { kind: 'lost_ownership' };
      }

      // succeeded requires a clean (non-cancelled) lease; a pending cancel
      // blocks success and routes the operator to the cancellation path.
      if (input.status === 'succeeded' && snap.cancel_requested_at !== null) {
        return { kind: 'cancellation_blocks_success' };
      }
      // cancelled requires that cancellation was requested first.
      if (input.status === 'cancelled' && snap.cancel_requested_at === null) {
        return { kind: 'cancellation_required' };
      }

      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET status = $5,
                lease_token = NULL,
                lease_expires_at = NULL,
                cancel_requested_at = NULL,
                fence_version = fence_version + 1,
                updated_at = now()
          WHERE project_id = $1 AND id = $2
            AND lease_token = $3 AND fence_version = $4
            AND status = 'running'
            AND lease_expires_at > clock_timestamp()
            AND (
              ($5 = 'succeeded' AND cancel_requested_at IS NULL)
              OR ($5 = 'cancelled' AND cancel_requested_at IS NOT NULL)
              OR $5 IN ('failed','dead')
            )
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
        input.leaseToken,
        input.fenceVersion,
        input.status,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'terminalized', job: toRecord(row) } : { kind: 'lost_ownership' };
    },

    async reclaimNextExpired(_input: JobReclaimInput): Promise<JobReclaimResult> {
      // Reclaim the oldest expired lease for this project with SKIP LOCKED,
      // then decide fate: cancel-requested -> cancelled terminal; otherwise
      // requeue for retry with a fresh fence and zero lease.
      const rows = (await tx.$queryRawUnsafe(
        `WITH candidate AS (
            SELECT id FROM generation_jobs
             WHERE status = 'running'
               AND lease_expires_at <= clock_timestamp()
             ORDER BY lease_expires_at ASC, id ASC
             FOR UPDATE OF generation_jobs SKIP LOCKED
             LIMIT 1
           ),
           terminalized AS (
             UPDATE generation_jobs
                SET status = 'cancelled',
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    fence_version = fence_version + 1,
                    updated_at = now()
              FROM candidate
             WHERE generation_jobs.id = candidate.id
               AND generation_jobs.cancel_requested_at IS NOT NULL
             RETURNING ${QUALIFIED_COLUMN_LIST}
           ),
           requeued AS (
             UPDATE generation_jobs
                SET status = 'queued',
                    available_at = now(),
                    lease_token = NULL,
                    lease_expires_at = NULL,
                    fence_version = fence_version + 1,
                    updated_at = now()
              FROM candidate
             WHERE generation_jobs.id = candidate.id
               AND generation_jobs.cancel_requested_at IS NULL
             RETURNING ${QUALIFIED_COLUMN_LIST}
           )
         (SELECT * FROM terminalized)
         UNION ALL
         (SELECT * FROM requeued)`,
      )) as RawRow[];
      const row = rows[0];
      if (!row) return { kind: 'none' };
      const job = toRecord(row);
      return job.status === 'cancelled' ? { kind: 'cancelled', job } : { kind: 'requeued', job };
    },

    async lockNextExpiredForReclaim(_input: JobReclaimInput) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST},
                (SELECT owner_user_id FROM projects WHERE id=generation_jobs.project_id) AS owner_user_id
           FROM generation_jobs
          WHERE status='running' AND lease_expires_at <= clock_timestamp()
          ORDER BY lease_expires_at ASC,id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      )) as Array<RawRow & { owner_user_id: string }>;
      const row = rows[0];
      return row
        ? {
            kind: 'locked' as const,
            job: toRecord(row),
            ownerUserId: row.owner_user_id,
            outcome: row.cancel_requested_at === null ? ('requeue' as const) : ('cancel' as const),
          }
        : { kind: 'none' as const };
    },

    async applyLockedExpiredReclaim(input) {
      const status = input.outcome === 'cancel' ? 'cancelled' : 'queued';
      const rows = (await tx.$queryRawUnsafe(
        `UPDATE generation_jobs
            SET status=$3,
                available_at=CASE WHEN $3='queued' THEN now() ELSE available_at END,
                lease_token=NULL,lease_expires_at=NULL,
                cancel_requested_at=CASE WHEN $3='cancelled' THEN NULL ELSE cancel_requested_at END,
                fence_version=fence_version+1,updated_at=now()
          WHERE project_id=$1 AND id=$2 AND status='running'
            AND lease_expires_at <= clock_timestamp()
            AND (($3='cancelled' AND cancel_requested_at IS NOT NULL)
              OR ($3='queued' AND cancel_requested_at IS NULL))
        RETURNING ${COLUMN_LIST}`,
        input.projectId,
        input.jobId,
        status,
      )) as RawRow[];
      const row = rows[0];
      if (!row) return { kind: 'none' };
      const job = toRecord(row);
      return input.outcome === 'cancel'
        ? { kind: 'cancelled' as const, job }
        : { kind: 'requeued' as const, job };
    },

    async lockForFencedPublish(identity: JobLeaseIdentity): Promise<JobFencedLockResult> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2
            AND lease_token = $3 AND fence_version = $4
            AND status = 'running'
            AND lease_expires_at > clock_timestamp()
            AND cancel_requested_at IS NULL
          FOR UPDATE`,
        identity.projectId,
        identity.jobId,
        identity.leaseToken,
        identity.fenceVersion,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'locked', job: toRecord(row) } : { kind: 'lost' };
    },

    async lockLiveOwnerForAttempt(identity: JobLeaseIdentity): Promise<JobLiveOwnerLockResult> {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT ${COLUMN_LIST}
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2
            AND lease_token = $3 AND fence_version = $4
            AND status = 'running'
            AND lease_expires_at > clock_timestamp()
            AND cancel_requested_at IS NULL
          FOR UPDATE`,
        identity.projectId,
        identity.jobId,
        identity.leaseToken,
        identity.fenceVersion,
      )) as RawRow[];
      const row = rows[0];
      return row ? { kind: 'locked', job: toRecord(row) } : { kind: 'not_authorized' };
    },

    async lockForFinalization(identity: JobLeaseIdentity) {
      const rows = (await tx.$queryRawUnsafe(
        `SELECT cancel_requested_at,
                lease_token = $3
                AND fence_version = $4
                AND status = 'running'
                AND lease_expires_at > clock_timestamp() AS eligible
           FROM generation_jobs
          WHERE project_id = $1 AND id = $2
          FOR UPDATE`,
        identity.projectId,
        identity.jobId,
        identity.leaseToken,
        identity.fenceVersion,
      )) as Array<{ cancel_requested_at: Date | null; eligible: boolean }>;
      const row = rows[0];
      if (!row) return { kind: 'not_authorized' as const };
      return {
        kind: 'locked' as const,
        eligibility: row.cancel_requested_at
          ? ('cancelled' as const)
          : row.eligible
            ? ('eligible' as const)
            : ('ineligible_owner' as const),
      };
    },
  };
}
