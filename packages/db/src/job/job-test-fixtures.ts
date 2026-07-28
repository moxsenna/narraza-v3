import type { Pool, PoolClient } from 'pg';
import { createPrismaClient, type PrismaClient } from '../client.js';
import { Prisma } from '../generated/client.js';

/**
 * Test-only fixtures for the leased job repository integration suite.
 *
 * Operational timestamps come from the PostgreSQL clock via `SELECT now()`;
 * these helpers never generate Node-side `Date` values that drive row state.
 */
export const jobIds = {
  a: '70000000-0000-4000-8000-000000000001',
  b: '70000000-0000-4000-8000-000000000002',
  c: '70000000-0000-4000-8000-000000000003',
  d: '70000000-0000-4000-8000-000000000004',
  e: '70000000-0000-4000-8000-000000000005',
  retry: '70000000-0000-4000-8000-000000000099',
  reservation: '71000000-0000-4000-8000-000000000001',
  reservationOther: '71000000-0000-4000-8000-000000000002',
} as const;

export const leaseTokens = {
  alice: 'lease-alice-001',
  bob: 'lease-bob-002',
  stale: 'lease-stale-003',
} as const;

export interface JobInsertFields {
  readonly id: string;
  readonly projectId: string;
  readonly kind?: string;
  readonly priority?: number;
  readonly availableOffsetMs?: number;
  readonly fenceVersion?: number;
  readonly retryOfJobId?: string | null;
  readonly schemaVersion?: number;
  readonly payload?: string;
}

/**
 * Insert a queued job row with the lease-check-satisfying shape (status
 * `queued` ⇒ lease columns NULL). Tests that need running/terminal/cancel
 * rows build them in two steps via `setRunning`, `setTerminal`, `setCancel`.
 */
export async function insertQueuedJobRow(client: Pool, fields: JobInsertFields): Promise<void> {
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,
        fence_version,cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,
        reservation_id,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,'queued',COALESCE($4::int,0),
             now() + ($5::bigint * INTERVAL '1 millisecond'),NULL,NULL,
             COALESCE($6::int,0),NULL,$7,NULL,NULL,NULL,
             COALESCE($8::int,1),COALESCE($9::jsonb,'{}'::jsonb),now(),now())`,
    [
      fields.id,
      fields.projectId,
      fields.kind ?? 'prose',
      fields.priority ?? null,
      BigInt(fields.availableOffsetMs ?? 0),
      fields.fenceVersion ?? null,
      fields.retryOfJobId ?? null,
      fields.schemaVersion ?? null,
      fields.payload ?? '{}',
    ],
  );
}

/** Mutate an existing queued row to running with a live lease. Satifies the lease-check. */
export async function setRunning(
  client: Pool,
  id: string,
  leaseToken: string,
  leaseExpiresOffsetMs: number,
): Promise<void> {
  await client.query(
    `UPDATE generation_jobs
        SET status = 'running',
            lease_token = $2,
            lease_expires_at = now() + ($3::bigint * INTERVAL '1 millisecond'),
            updated_at = now()
      WHERE id = $1`,
    [id, leaseToken, BigInt(leaseExpiresOffsetMs)],
  );
}

/** Set cancel_requested_at to now() on a running job. */
export async function setCancelRequested(client: Pool, id: string): Promise<void> {
  await client.query(
    `UPDATE generation_jobs SET cancel_requested_at = now(), updated_at = now() WHERE id = $1`,
    [id],
  );
}

/** Give rows deterministic ordering timestamps from one PostgreSQL clock reading. */
export async function setJobOrdering(
  client: Pool,
  rows: ReadonlyArray<{
    readonly id: string;
    readonly availableOffsetMs: number;
    readonly createdOffsetMs: number;
  }>,
): Promise<void> {
  await client.query(
    `UPDATE generation_jobs AS jobs
        SET available_at = now() + (ordering.available_offset_ms * INTERVAL '1 millisecond'),
            created_at = now() + (ordering.created_offset_ms * INTERVAL '1 millisecond')
       FROM jsonb_to_recordset($1::jsonb)
         AS ordering(id uuid, available_offset_ms bigint, created_offset_ms bigint)
      WHERE jobs.id::uuid = ordering.id`,
    [
      JSON.stringify(
        rows.map((row) => ({
          id: row.id,
          available_offset_ms: row.availableOffsetMs,
          created_offset_ms: row.createdOffsetMs,
        })),
      ),
    ],
  );
}

/** Move a queued row to a terminal status (no lease check concern since lease is already NULL). */
export async function setTerminal(client: Pool, id: string, status: string): Promise<void> {
  await client.query(`UPDATE generation_jobs SET status = $2, updated_at = now() WHERE id = $1`, [
    id,
    status,
  ]);
}

/**
 * Promote a queued row directly to a terminal status with an intermediate running
 * state and live lease so the reservation/lease constraints stay satisfied
 * across the transition. Provided for full-spectrum terminal fixtures that
 * originate from a queued row.
 */
export async function promoteToTerminalViaRunning(
  client: Pool,
  id: string,
  leaseToken: string,
  status: string,
): Promise<void> {
  await setRunning(client, id, leaseToken, 30000);
  await client.query(
    `UPDATE generation_jobs
        SET status = $2,
            lease_token = NULL,
            lease_expires_at = NULL,
            cancel_requested_at = NULL,
            updated_at = now()
      WHERE id = $1`,
    [id, status],
  );
}

export interface JobSnapshot {
  readonly id: string;
  readonly status: string;
  readonly priority: number;
  readonly availableAt: Date;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly fenceVersion: number;
  readonly cancelRequestedAt: Date | null;
  readonly retryOfJobId: string | null;
  readonly bundleId: string | null;
  readonly workflowPlanId: string | null;
  readonly reservationId: string | null;
  readonly schemaVersion: number;
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fetch a single job row as raw snake_case for assertions. */
export async function fetchJobRow(client: Pool, id: string): Promise<JobSnapshot | null> {
  const result = await client.query(
    `SELECT id,status,priority,available_at,lease_token,lease_expires_at,fence_version,
            cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,reservation_id,
            schema_version,payload,created_at,updated_at
       FROM generation_jobs WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    status: r.status as string,
    priority: r.priority as number,
    availableAt: r.available_at as Date,
    leaseToken: (r.lease_token as string | null) ?? null,
    leaseExpiresAt: (r.lease_expires_at as Date | null) ?? null,
    fenceVersion: r.fence_version as number,
    cancelRequestedAt: (r.cancel_requested_at as Date | null) ?? null,
    retryOfJobId: (r.retry_of_job_id as string | null) ?? null,
    bundleId: (r.bundle_id as string | null) ?? null,
    workflowPlanId: (r.workflow_plan_id as string | null) ?? null,
    reservationId: (r.reservation_id as string | null) ?? null,
    schemaVersion: r.schema_version as number,
    payload: r.payload,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

/** Same shape as fetchJobRow but commits a held transaction first by capturing within it. */
export async function fetchJobRowTx(client: PoolClient, id: string): Promise<JobSnapshot | null> {
  const result = await client.query(
    `SELECT id,status,priority,available_at,lease_token,lease_expires_at,fence_version,
            cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,reservation_id,
            schema_version,payload,created_at,updated_at
       FROM generation_jobs WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0] as Record<string, unknown>;
  return {
    id: r.id as string,
    status: r.status as string,
    priority: r.priority as number,
    availableAt: r.available_at as Date,
    leaseToken: (r.lease_token as string | null) ?? null,
    leaseExpiresAt: (r.lease_expires_at as Date | null) ?? null,
    fenceVersion: r.fence_version as number,
    cancelRequestedAt: (r.cancel_requested_at as Date | null) ?? null,
    retryOfJobId: (r.retry_of_job_id as string | null) ?? null,
    bundleId: (r.bundle_id as string | null) ?? null,
    workflowPlanId: (r.workflow_plan_id as string | null) ?? null,
    reservationId: (r.reservation_id as string | null) ?? null,
    schemaVersion: r.schema_version as number,
    payload: r.payload,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

export interface DbNowSnapshot {
  readonly now: Date;
}

export async function dbNowSnapshot(client: Pool | PoolClient): Promise<Date> {
  const result = await client.query('SELECT now() AS now');
  const row = result.rows[0] as { now: Date | string };
  const raw = row.now;
  return raw instanceof Date ? raw : new Date(raw as string);
}

/**
 * Seed a credit reservation bound to a job plus the reciprocal job pointer.
 * Insert the reservation referencing the job first (FK reservation -> job),
 * then UPDATE the job to point back at the reservation (FK job -> reservation).
 * Returns the reservation id.
 */
export async function insertReservationBinding(
  client: Pool,
  fields: {
    readonly reservationId: string;
    readonly jobId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly status?: string;
    readonly reservedMicroIdr?: bigint;
    readonly exposureMicroIdr?: bigint;
    readonly closingAt?: boolean;
  },
): Promise<void> {
  const status = fields.status ?? 'open';
  const reserved = fields.reservedMicroIdr ?? 1000n;
  // credit_reservations lifecycle: open requires exposure == reserved; released/expired require closing_at and released==reserved.
  const exposure = fields.exposureMicroIdr ?? reserved;
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,exposure_micro_idr,closing_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END,now())`,
    [
      fields.reservationId,
      fields.userId,
      fields.projectId,
      fields.jobId,
      status,
      reserved,
      exposure,
      fields.closingAt ?? false,
    ],
  );
  await client.query(
    `UPDATE generation_jobs SET reservation_id = $1, updated_at = now() WHERE id = $2`,
    [fields.reservationId, fields.jobId],
  );
}

/**
 * Create an independent PrismaClient bound to the container URL so tests can
 * drive `createJobRepo(tx)` through real `$transaction` callbacks and exercise
 * row locking across two clients.
 */
export function createPrismaForUrl(databaseUrl: string): PrismaClient {
  return createPrismaClient(databaseUrl);
}

export type TxClient = Prisma.TransactionClient;

export function withTx<T>(
  prisma: PrismaClient,
  isolation: 'read_committed' | 'serializable',
  body: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const level =
    isolation === 'serializable'
      ? Prisma.TransactionIsolationLevel.Serializable
      : Prisma.TransactionIsolationLevel.ReadCommitted;
  return prisma.$transaction(async (tx) => body(tx), { isolationLevel: level });
}

/** Begin two independent pg PoolClients for SKIP LOCKED concurrency tests. */
export async function beginTwoClients(pool: Pool): Promise<[PoolClient, PoolClient]> {
  const a = await pool.connect();
  const b = await pool.connect();
  return [a, b];
}
