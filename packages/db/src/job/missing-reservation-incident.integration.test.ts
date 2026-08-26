import {
  createJobService,
  createWorkflowInvocationService,
  type JobFinishResult,
} from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl, insertQueuedJobRow, leaseTokens } from './job-test-fixtures.js';

const suite = createSchemaTestSuite();
const JOB_ID = '7b000000-0000-4000-8000-000000000010';
const INVOCATION_ID = 'funding-incident-invocation';
const ATTEMPT_A = 'funding-incident-attempt-a';
const PRICE_ID = 'funding-incident-price';

const INCIDENT_KEY = `incident:job-missing-reservation:${JOB_ID}`;

interface IncidentRowShape {
  readonly id: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly dedupe_key: string;
  readonly schema_version: number;
  readonly payload: Record<string, unknown>;
}

async function fetchIncident(client: Pool): Promise<IncidentRowShape | undefined> {
  const rows = (await client.query(
    `SELECT id,aggregate_type,aggregate_id,event_type,dedupe_key,schema_version,payload
       FROM outbox_events WHERE dedupe_key=$1`,
    [INCIDENT_KEY],
  )) as unknown as { rows: IncidentRowShape[] };
  return rows.rows[0];
}

async function countLedgerAndAllocations(
  client: Pool,
): Promise<{ ledger: number; allocations: number }> {
  const ledger = await client.query(`SELECT count(*)::int AS n FROM credit_ledger`);
  const allocations = await client.query(
    `SELECT count(*)::int AS n FROM credit_billing_allocations`,
  );
  return {
    ledger: ledger.rows[0].n as number,
    allocations: allocations.rows[0].n as number,
  };
}

/**
 * Seed a running-eligible corrupt job: known nonlegacy kind, reservation_id NULL
 * (the corruption under test), plus optional invocation/attempts for late paths.
 */
async function seedCorruptQueuedJob(
  client: Pool,
  fields: {
    readonly kind: string;
    readonly jobId?: string;
    readonly withWorkflow?: boolean;
  },
): Promise<void> {
  const jobId = fields.jobId ?? JOB_ID;
  await seedUsersAndProjects(client);
  await insertQueuedJobRow(client, {
    id: jobId,
    projectId: ids.projectA,
    kind: fields.kind,
  });
  if (fields.withWorkflow === true) {
    await client.query(
      `INSERT INTO model_price_snapshots
         (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
       VALUES ($1,'provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
      [PRICE_ID],
    );
    await client.query(
      `INSERT INTO workflow_invocations
         (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at)
       VALUES ($1,$2,$3,'writer','running',NULL,0,now(),now())`,
      [INVOCATION_ID, ids.projectA, jobId],
    );
    await client.query(
      `INSERT INTO generation_attempts
         (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
       VALUES ($1,$2,$3,$4,0,'started',now(),NULL,1,'{}',now(),now())`,
      [ATTEMPT_A, ids.projectA, jobId, INVOCATION_ID],
    );
  }
}

function assertMissingViolation(
  result: JobFinishResult,
  expected: { readonly fundingModel: 'user_paid' | 'system_funded'; readonly incident: string },
): void {
  expect(result).toMatchObject({
    kind: 'funding_model_violation',
    reason: 'missing_reservation',
    fundingModel: expected.fundingModel,
    incident: expected.incident,
  });
}

suite.test(
  'missing-reservation: user_paid failed finish commits failed evidence plus one exact incident and zero financial writes',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      const clock = await client.query(`SELECT now() AS t`);
      const result = await jobs.finish({ ...claim.identity, status: 'failed' });
      assertMissingViolation(result, { fundingModel: 'user_paid', incident: 'appended' });

      const job = (
        await client.query(
          `SELECT status,lease_token,lease_expires_at,fence_version,reservation_id
             FROM generation_jobs WHERE id=$1`,
          [JOB_ID],
        )
      ).rows[0];
      expect(job.status).toBe('failed');
      expect(job.lease_token).toBeNull();
      expect(job.lease_expires_at).toBeNull();
      expect(job.fence_version).toBe(claim.identity.fenceVersion + 1);
      expect(job.reservation_id).toBeNull();

      const incident = await fetchIncident(client);
      expect(incident).toMatchObject({
        aggregate_type: 'generation_job',
        aggregate_id: JOB_ID,
        event_type: 'credit.job_missing_reservation',
        dedupe_key: INCIDENT_KEY,
        schema_version: 1,
        payload: {
          projectId: ids.projectA,
          jobId: JOB_ID,
          jobKind: 'scene_generation',
          fundingModel: 'user_paid',
        },
      });

      const financial = await countLedgerAndAllocations(client);
      expect(financial).toEqual({ ledger: 0, allocations: 0 });
      const reservations = await client.query(`SELECT count(*)::int AS n FROM credit_reservations`);
      expect(reservations.rows[0].n).toBe(0);
      expect(clock.rows[0].t).toBeDefined();
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: requested succeeded never fakes success; durable status is failed',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      const result = await jobs.finish({ ...claim.identity, status: 'succeeded' });
      assertMissingViolation(result, { fundingModel: 'user_paid', incident: 'appended' });

      const job = (await client.query(`SELECT status FROM generation_jobs WHERE id=$1`, [JOB_ID]))
        .rows[0];
      expect(job.status).toBe('failed');

      const sentinels = await client.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE dedupe_key<>$1`,
        [INCIDENT_KEY],
      );
      expect(sentinels.rows[0].n).toBe(0);
      const financial = await countLedgerAndAllocations(client);
      expect(financial).toEqual({ ledger: 0, allocations: 0 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: system_funded failed finish emits typed incident with zero user charge',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'chat_intake' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      const result = await jobs.finish({ ...claim.identity, status: 'failed' });
      assertMissingViolation(result, { fundingModel: 'system_funded', incident: 'appended' });

      const job = (await client.query(`SELECT status FROM generation_jobs WHERE id=$1`, [JOB_ID]))
        .rows[0];
      expect(job.status).toBe('failed');
      const incident = await fetchIncident(client);
      expect(incident?.payload).toMatchObject({ fundingModel: 'system_funded' });
      const financial = await countLedgerAndAllocations(client);
      expect(financial).toEqual({ ledger: 0, allocations: 0 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: fenced publish preflight skips callback, classifier artifacts, and publication',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prisma = createPrismaForUrl(databaseUrl);
    let callbackInvocations = 0;
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      const result = await jobs.withFencedPublish(claim.identity, async (context) => {
        callbackInvocations += 1;
        await context.appendSentinel({
          aggregateType: 'publication_probe',
          aggregateId: JOB_ID,
          eventType: 'probe.should_never_exist',
          dedupeKey: `probe:${JOB_ID}`,
          payload: {},
        });
      });
      assertMissingViolation(result, { fundingModel: 'user_paid', incident: 'appended' });

      expect(callbackInvocations).toBe(0);
      const probe = await client.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE dedupe_key=$1`,
        [`probe:${JOB_ID}`],
      );
      expect(probe.rows[0].n).toBe(0);
      const job = (await client.query(`SELECT status FROM generation_jobs WHERE id=$1`, [JOB_ID]))
        .rows[0];
      expect(job.status).toBe('failed');
      expect(await fetchIncident(client)).toBeDefined();
      const financial = await countLedgerAndAllocations(client);
      expect(financial).toEqual({ ledger: 0, allocations: 0 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: expired cancellation reclaim commits cancelled job plus incident atomically',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      await jobs.cancel({ projectId: ids.projectA, jobId: JOB_ID });
      await client.query(
        `UPDATE generation_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [JOB_ID],
      );

      const result = await jobs.reclaimOne({});
      expect(result).toMatchObject({
        kind: 'funding_model_violation',
        reason: 'missing_reservation',
        fundingModel: 'user_paid',
        incident: 'appended',
        job: { status: 'cancelled' },
      });

      const job = (
        await client.query(`SELECT status,lease_token FROM generation_jobs WHERE id=$1`, [JOB_ID])
      ).rows[0];
      expect(job.status).toBe('cancelled');
      expect(job.lease_token).toBeNull();
      expect(await fetchIncident(client)).toBeDefined();
      const financial = await countLedgerAndAllocations(client);
      expect(financial).toEqual({ ledger: 0, allocations: 0 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: late finalization commits usage in Tx B then incident in Tx L with idempotent replay',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation', withWorkflow: true });
    const prisma = createPrismaForUrl(databaseUrl);
    const invocations = createWorkflowInvocationService(createUnitOfWork(prisma));
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      const finished = await jobs.finish({ ...claim.identity, status: 'failed' });
      assertMissingViolation(finished, { fundingModel: 'user_paid', incident: 'appended' });

      const lateInput = {
        ...claim.identity,
        invocationId: INVOCATION_ID,
        attemptId: ATTEMPT_A,
        status: 'succeeded' as const,
        providerRequestId: 'provider-late',
        resultHash: null,
        schemaVersion: 1,
        payload: { late: true },
        usage: {
          priceSnapshotId: PRICE_ID,
          inputTokens: 1,
          outputTokens: 1,
          providerCostMicroIdr: 100n,
        },
      };

      const first = await invocations.finalizeAttempt(lateInput);
      // finish already recorded the job-scoped incident; Tx L replays it so the
      // corrupt job keeps exactly one durable incident across all paths.
      expect(first).toMatchObject({
        kind: 'funding_model_violation',
        reason: 'missing_reservation',
        fundingModel: 'user_paid',
        incident: 'replayed',
      });

      const afterFirst = (
        await client.query(
          `SELECT (SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) AS usage_count,
                  (SELECT count(*)::int FROM outbox_events WHERE dedupe_key=$3) AS incident_count,
                  (SELECT count(*)::int FROM credit_ledger) AS ledger_count,
                  (SELECT count(*)::int FROM credit_billing_allocations) AS allocation_count
             FROM generation_jobs WHERE id=$1`,
          [JOB_ID, ATTEMPT_A, INCIDENT_KEY],
        )
      ).rows[0];
      expect(afterFirst).toEqual({
        usage_count: 1,
        incident_count: 1,
        ledger_count: 0,
        allocation_count: 0,
      });

      const replay = await invocations.finalizeAttempt(lateInput);
      expect(replay).toMatchObject({
        kind: 'funding_model_violation',
        incident: 'replayed',
      });
      const afterReplay = (
        await client.query(
          `SELECT (SELECT count(*)::int FROM ai_usage_events WHERE attempt_id=$2) AS usage_count,
                  (SELECT count(*)::int FROM outbox_events WHERE dedupe_key=$3) AS incident_count
             FROM generation_jobs WHERE id=$1`,
          [JOB_ID, ATTEMPT_A, INCIDENT_KEY],
        )
      ).rows[0];
      expect(afterReplay).toEqual({ usage_count: 1, incident_count: 1 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: semantic exact replay replays once and conflicts on divergent tuple without mutation',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const unitOfWork = createUnitOfWork(prisma);

      const first = await unitOfWork.execute((ports) => {
        const append = ports.outbox.appendMissingJobReservationIncident;
        if (append === undefined) throw new Error('capability unavailable');
        return append({
          id: INCIDENT_KEY,
          projectId: ids.projectA,
          jobId: JOB_ID,
          jobKind: 'scene_generation',
          fundingModel: 'user_paid',
          dedupeKey: INCIDENT_KEY,
        });
      });
      expect(first).toEqual({ kind: 'appended' });

      const second = await unitOfWork.execute((ports) => {
        const append = ports.outbox.appendMissingJobReservationIncident;
        if (append === undefined) throw new Error('capability unavailable');
        return append({
          id: INCIDENT_KEY,
          projectId: ids.projectA,
          jobId: JOB_ID,
          jobKind: 'scene_generation',
          fundingModel: 'user_paid',
          dedupeKey: INCIDENT_KEY,
        });
      });
      expect(second).toEqual({ kind: 'replayed' });
      expect(((await fetchIncident(client)) ?? {}).dedupe_key).toBe(INCIDENT_KEY);

      const before = await fetchIncident(client);
      await client.query(`DELETE FROM outbox_events WHERE dedupe_key=$1`, [INCIDENT_KEY]);
      await client.query(
        `INSERT INTO outbox_events
           (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
         VALUES ($1,'generation_job',$2,'credit.job_missing_reservation',$3,now(),1,$4::jsonb,now())`,
        [
          INCIDENT_KEY,
          JOB_ID,
          INCIDENT_KEY,
          JSON.stringify({
            projectId: ids.projectA,
            jobId: JOB_ID,
            jobKind: 'outline_generation',
            fundingModel: 'user_paid',
          }),
        ],
      );

      const conflict = await unitOfWork.execute((ports) => {
        const append = ports.outbox.appendMissingJobReservationIncident;
        if (append === undefined) throw new Error('capability unavailable');
        return append({
          id: INCIDENT_KEY,
          projectId: ids.projectA,
          jobId: JOB_ID,
          jobKind: 'scene_generation',
          fundingModel: 'user_paid',
          dedupeKey: INCIDENT_KEY,
        });
      });
      expect(conflict).toEqual({ kind: 'conflict' });

      const afterConflict = await fetchIncident(client);
      expect(afterConflict?.payload).toMatchObject({ jobKind: 'outline_generation' });
      expect(afterConflict?.payload).not.toMatchObject({ jobKind: 'scene_generation' });
      expect(before).toBeDefined();
    } finally {
      await prisma.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: concurrent identical appends produce exactly one appended and one durable row',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'scene_generation' });
    const prismaA = createPrismaForUrl(databaseUrl);
    const prismaB = createPrismaForUrl(databaseUrl);
    try {
      const appendOnce = (unitOfWork: ReturnType<typeof createUnitOfWork>) =>
        unitOfWork.execute((ports) => {
          const append = ports.outbox.appendMissingJobReservationIncident;
          if (append === undefined) throw new Error('capability unavailable');
          return append({
            id: INCIDENT_KEY,
            projectId: ids.projectA,
            jobId: JOB_ID,
            jobKind: 'scene_generation',
            fundingModel: 'user_paid',
            dedupeKey: INCIDENT_KEY,
          });
        });

      const [a, b] = await Promise.all([
        appendOnce(createUnitOfWork(prismaA)),
        appendOnce(createUnitOfWork(prismaB)),
      ]);
      expect([a.kind, b.kind].sort()).toEqual(['appended', 'replayed']);

      const rows = await client.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE dedupe_key=$1`,
        [INCIDENT_KEY],
      );
      expect(rows.rows[0].n).toBe(1);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  },
);

suite.test(
  'missing-reservation: pre_d4_legacy null reservation keeps baseline terminal behavior without incident',
  async ({ client, databaseUrl }) => {
    await seedCorruptQueuedJob(client, { kind: 'prose' });
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const jobs = createJobService(createUnitOfWork(prisma));
      const claim = await jobs.claim({ leaseToken: leaseTokens.alice, leaseDurationMs: 60_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      await expect(jobs.finish({ ...claim.identity, status: 'failed' })).resolves.toMatchObject({
        kind: 'terminalized',
        job: { status: 'failed', leaseToken: null },
      });

      const incidents = await client.query(`SELECT count(*)::int AS n FROM outbox_events`);
      expect(incidents.rows[0].n).toBe(0);
      const ledger = await client.query(`SELECT count(*)::int AS n FROM credit_ledger`);
      expect(ledger.rows[0].n).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);
