import {
  createJobService,
  createSystemFundedIntakeService,
  INTAKE_FAIR_USE_COUNTER_KIND,
} from '@narraza/application';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();
const BUNDLE_ID = 'm4-intake-bundle';
const PLAN_ID = 'm4-intake-plan';
const PLAN_HASH = 'a'.repeat(64);
const DEPENDENCY_HASH = 'b'.repeat(64);
const BUDGET = 12_345n;

async function seedExactPlan(client: Parameters<typeof seedUsersAndProjects>[0]): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('m4-intake-snapshot',$1,'extraction','review_safe',$2,$3,1,'{}',now())`,
    [ids.projectA, DEPENDENCY_HASH, 'c'.repeat(64)],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ($1,$2,'m4-intake-snapshot',$3,$4,now()+interval '1 day',1,'{}',now())`,
    [BUNDLE_ID, ids.projectA, DEPENDENCY_HASH, 'd'.repeat(64)],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ($1,$2,$3,'chat_intake_reply',$4,$5,1,$6::jsonb,now())`,
    [
      PLAN_ID,
      ids.projectA,
      BUNDLE_ID,
      PLAN_HASH,
      BUDGET,
      JSON.stringify({ schemaVersion: 1, workflowKind: 'chat_intake_reply', stages: [] }),
    ],
  );
}

function input(requestId: string) {
  return {
    requestId,
    userId: ids.userA,
    projectId: ids.projectA,
    bundleId: BUNDLE_ID,
    workflowPlanId: PLAN_ID,
    workflowPlanHash: PLAN_HASH,
    dependencyHash: DEPENDENCY_HASH,
    budgetMicroIdr: BUDGET,
    payload: { intakeSessionId: 'session-1' },
  } as const;
}

schema.test(
  'system-funded budget path is atomic, exact-replay idempotent, zero-ledger, and terminally released',
  async ({ client, databaseUrl }) => {
    await seedExactPlan(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const service = createSystemFundedIntakeService({ unitOfWork });

    try {
      const accepted = await service.create(input('stable-request'));
      expect(accepted.kind).toBe('accepted');
      if (accepted.kind !== 'accepted') throw new Error('expected accepted intake');

      const replay = await service.create(input('stable-request'));
      expect(replay).toMatchObject({
        kind: 'exact_replay',
        reservationId: accepted.reservationId,
        job: { id: accepted.job.id },
      });
      await expect(
        service.create({ ...input('stable-request'), budgetMicroIdr: BUDGET + 1n }),
      ).resolves.toEqual({ kind: 'conflict' });
      await expect(
        service.create({
          ...input('stable-request'),
          payload: { intakeSessionId: 'different-session' },
        }),
      ).resolves.toEqual({ kind: 'conflict' });
      expect(
        (
          await client.query(`SELECT count FROM rate_limit_counters WHERE kind=$1`, [
            INTAKE_FAIR_USE_COUNTER_KIND,
          ])
        ).rows[0].count,
      ).toBe(1);

      const reservation = await client.query<{
        funding_model: string;
        reserved_micro_idr: string;
        settled_micro_idr: string;
        released_micro_idr: string;
        exposure_micro_idr: string;
        quote_id: string | null;
        confirmation_request_id: string;
        job_id: string;
        job_project_id: string;
      }>(
        `SELECT funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,
              exposure_micro_idr,quote_id,confirmation_request_id,job_id,job_project_id
         FROM credit_reservations WHERE id=$1`,
        [accepted.reservationId],
      );
      expect(reservation.rows[0]).toEqual({
        funding_model: 'system_funded',
        reserved_micro_idr: BUDGET.toString(),
        settled_micro_idr: '0',
        released_micro_idr: '0',
        exposure_micro_idr: BUDGET.toString(),
        quote_id: null,
        confirmation_request_id: `system-budget:${accepted.job.id}`,
        job_id: accepted.job.id,
        job_project_id: ids.projectA,
      });
      expect(await client.query('SELECT 1 FROM credit_quotes')).toHaveProperty('rowCount', 0);
      expect(await client.query('SELECT 1 FROM credit_ledger')).toHaveProperty('rowCount', 0);

      const jobs = createJobService(unitOfWork);
      const claimed = await jobs.claim({ leaseToken: 'm4-lease', leaseDurationMs: 60_000 });
      expect(claimed.kind).toBe('claimed');
      if (claimed.kind !== 'claimed') throw new Error('expected claimed intake');
      expect(await jobs.finish({ ...claimed.identity, status: 'failed' })).toMatchObject({
        kind: 'terminalized',
      });

      const terminal = await client.query<{
        status: string;
        settled_micro_idr: string;
        released_micro_idr: string;
        exposure_micro_idr: string;
      }>(
        `SELECT status,settled_micro_idr,released_micro_idr,exposure_micro_idr
         FROM credit_reservations WHERE id=$1`,
        [accepted.reservationId],
      );
      expect(terminal.rows[0]).toEqual({
        status: 'released',
        settled_micro_idr: '0',
        released_micro_idr: BUDGET.toString(),
        exposure_micro_idr: '0',
      });
      expect(await client.query('SELECT 1 FROM credit_ledger')).toHaveProperty('rowCount', 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'system-funded intake rejects non-authoritative plan bindings before quota mutation',
  async ({ client, databaseUrl }) => {
    await seedExactPlan(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createSystemFundedIntakeService({ unitOfWork: createUnitOfWork(prisma) });
    try {
      await expect(
        service.create({ ...input('wrong-hash'), workflowPlanHash: 'wrong' }),
      ).resolves.toEqual({ kind: 'conflict' });
      await expect(
        service.create({ ...input('wrong-dependency'), dependencyHash: 'wrong' }),
      ).resolves.toEqual({ kind: 'conflict' });
      await expect(
        service.create({ ...input('wrong-budget'), budgetMicroIdr: BUDGET + 1n }),
      ).resolves.toEqual({ kind: 'conflict' });
      expect(await client.query('SELECT 1 FROM rate_limit_counters')).toHaveProperty('rowCount', 0);
      expect(await client.query('SELECT 1 FROM generation_jobs')).toHaveProperty('rowCount', 0);
      expect(await client.query('SELECT 1 FROM credit_reservations')).toHaveProperty('rowCount', 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'concurrent identical requestId accepts once and exact-replays without consuming quota',
  async ({ client, databaseUrl }) => {
    await seedExactPlan(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createSystemFundedIntakeService({ unitOfWork: createUnitOfWork(prisma) });

    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => service.create(input('identical-concurrent-request'))),
      );
      const accepted = results.filter((result) => result.kind === 'accepted');
      const replays = results.filter((result) => result.kind === 'exact_replay');
      expect(accepted).toHaveLength(1);
      expect(replays).toHaveLength(11);
      if (accepted[0]?.kind !== 'accepted') throw new Error('expected one accepted intake');
      for (const replay of replays) {
        expect(replay).toMatchObject({
          kind: 'exact_replay',
          reservationId: accepted[0].reservationId,
          job: { id: accepted[0].job.id },
        });
      }

      await expect(
        service.create({
          ...input('identical-concurrent-request'),
          payload: { intakeSessionId: 'conflicting-session' },
        }),
      ).resolves.toEqual({ kind: 'conflict' });

      const state = await client.query<{
        counters: string;
        fair_use_count: number;
        jobs: string;
        reservations: string;
        quotes: string;
        ledger: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM rate_limit_counters WHERE kind=$1) AS counters,
           (SELECT count FROM rate_limit_counters WHERE kind=$1) AS fair_use_count,
           (SELECT count(*)::text FROM generation_jobs) AS jobs,
           (SELECT count(*)::text FROM credit_reservations) AS reservations,
           (SELECT count(*)::text FROM credit_quotes) AS quotes,
           (SELECT count(*)::text FROM credit_ledger) AS ledger`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );
      expect(state.rows[0]).toEqual({
        counters: '1',
        fair_use_count: 1,
        jobs: '1',
        reservations: '1',
        quotes: '0',
        ledger: '0',
      });
      const counter = await client.query<{ key_hash: string }>(
        `SELECT key_hash FROM rate_limit_counters WHERE kind=$1`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );
      expect(counter.rows[0]?.key_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(counter.rows[0]?.key_hash).not.toBe(ids.userA);
    } finally {
      await prisma.$disconnect();
    }
  },
  60_000,
);

schema.test(
  'fair-use intake rolls over at PostgreSQL-derived Asia/Jakarta calendar boundary',
  async ({ client, databaseUrl }) => {
    await seedExactPlan(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createSystemFundedIntakeService({ unitOfWork: createUnitOfWork(prisma) });

    try {
      for (let index = 0; index < 60; index += 1) {
        await expect(service.create(input(`before-boundary-${index}`))).resolves.toMatchObject({
          kind: 'accepted',
        });
      }
      await expect(service.create(input('before-boundary-61'))).resolves.toEqual({
        kind: 'fair_use_limited',
        limit: 60,
      });

      const beforeBoundary = await client.query<{
        count: number;
        starts_at: Date;
        expected_starts_at: Date;
      }>(
        `SELECT c.count,c.window_starts_at AS starts_at,
                ((clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::timestamp
                  AT TIME ZONE 'Asia/Jakarta') AS expected_starts_at
           FROM rate_limit_counters c
          WHERE c.kind=$1`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );
      expect(beforeBoundary.rows).toHaveLength(1);
      expect(beforeBoundary.rows[0]?.count).toBe(60);
      expect(beforeBoundary.rows[0]?.starts_at).toEqual(beforeBoundary.rows[0]?.expected_starts_at);

      // Advance only persisted test state across PostgreSQL-computed calendar boundaries.
      // Intake remains unchanged and derives its new window from PostgreSQL now().
      await client.query(
        `UPDATE rate_limit_counters
            SET window_starts_at = window_starts_at - interval '1 day',
                expires_at = expires_at - interval '1 day'
          WHERE kind=$1`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );

      await expect(service.create(input('after-boundary-first'))).resolves.toMatchObject({
        kind: 'accepted',
      });
      const windows = await client.query<{
        count: number;
        starts_at: Date;
        jakarta_date: string;
      }>(
        `SELECT count,window_starts_at AS starts_at,
                (window_starts_at AT TIME ZONE 'Asia/Jakarta')::date::text AS jakarta_date
           FROM rate_limit_counters
          WHERE kind=$1
          ORDER BY window_starts_at`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );
      expect(windows.rows).toHaveLength(2);
      expect(windows.rows.map(({ count }) => count)).toEqual([60, 1]);
      expect(windows.rows[1]?.starts_at).toEqual(beforeBoundary.rows[0]?.expected_starts_at);
      expect(windows.rows[0]?.jakarta_date).not.toBe(windows.rows[1]?.jakarta_date);

      const state = await client.query<{ jobs: string; reservations: string }>(
        `SELECT
           (SELECT count(*)::text FROM generation_jobs) AS jobs,
           (SELECT count(*)::text FROM credit_reservations) AS reservations`,
      );
      expect(state.rows[0]).toEqual({ jobs: '61', reservations: '61' });
      expect(await client.query('SELECT 1 FROM credit_quotes')).toHaveProperty('rowCount', 0);
      expect(await client.query('SELECT 1 FROM credit_ledger')).toHaveProperty('rowCount', 0);
    } finally {
      await prisma.$disconnect();
    }
  },
  60_000,
);

schema.test(
  'fair-use intake limit admits exactly 60 concurrent Jakarta-day generations and blocks before rows',
  async ({ client, databaseUrl }) => {
    await seedExactPlan(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createSystemFundedIntakeService({ unitOfWork: createUnitOfWork(prisma) });

    try {
      const results = await Promise.all(
        Array.from({ length: 61 }, (_, index) => service.create(input(`concurrent-${index}`))),
      );
      expect(results.filter((result) => result.kind === 'accepted')).toHaveLength(60);
      expect(results.filter((result) => result.kind === 'fair_use_limited')).toHaveLength(1);

      const counter = await client.query<{ count: number; jakarta_date: string }>(
        `SELECT count,(window_starts_at AT TIME ZONE 'Asia/Jakarta')::date::text AS jakarta_date
         FROM rate_limit_counters WHERE kind=$1 AND key_hash=$2`,
        [INTAKE_FAIR_USE_COUNTER_KIND, ids.userA],
      );
      expect(counter.rows).toHaveLength(0);
      const opaqueCounter = await client.query<{ count: number; key_hash: string }>(
        `SELECT count,key_hash FROM rate_limit_counters WHERE kind=$1`,
        [INTAKE_FAIR_USE_COUNTER_KIND],
      );
      expect(opaqueCounter.rows).toHaveLength(1);
      expect(opaqueCounter.rows[0]?.key_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(opaqueCounter.rows[0]?.key_hash).not.toBe(ids.userA);
      expect(opaqueCounter.rows[0]?.count).toBe(60);

      const rows = await client.query<{ jobs: string; reservations: string }>(
        `SELECT
         (SELECT count(*)::text FROM generation_jobs) AS jobs,
         (SELECT count(*)::text FROM credit_reservations) AS reservations`,
      );
      expect(rows.rows[0]).toEqual({ jobs: '60', reservations: '60' });
      expect(await client.query('SELECT 1 FROM credit_ledger')).toHaveProperty('rowCount', 0);
    } finally {
      await prisma.$disconnect();
    }
  },
  60_000,
);
