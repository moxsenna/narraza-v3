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
  'system-funded-budget-path is atomic, replay-free, zero-ledger, and terminally released',
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
  'fair-use-intake-limit admits exactly 60 concurrent Jakarta-day generations and blocks before rows',
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
