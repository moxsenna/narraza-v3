import { createJobService, createWorkflowInvocationService } from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedPlanningGraph } from '../schema-test/fixtures.js';
import {
  createPrismaForUrl,
  insertQueuedJobRow,
  insertReservationBinding,
  leaseTokens,
} from './job-test-fixtures.js';

const schema = createSchemaTestSuite();
const JOB_ID = '79000000-0000-4000-8000-000000000009';
const RESERVATION_ID = '79100000-0000-4000-8000-000000000009';
const ATTEMPT_ID = 'task9-attempt-winner';
const OUTPUT_REF = 'task9-prose-version';

async function seedRunningSettlement(client: Pool, providerCost: bigint, reserved: bigint) {
  await seedPlanningGraph(client);
  await insertQueuedJobRow(client, {
    id: JOB_ID,
    projectId: ids.projectA,
    kind: 'scene_generation',
  });
  await insertReservationBinding(client, {
    reservationId: RESERVATION_ID,
    jobId: JOB_ID,
    projectId: ids.projectA,
    userId: ids.userA,
    reservedMicroIdr: reserved,
  });
  await client.query(
    `UPDATE credit_reservations
        SET job_project_id=$1,funding_model='user_paid'
      WHERE id=$2`,
    [ids.projectA, RESERVATION_ID],
  );
  await client.query(
    `INSERT INTO workflow_invocations
       (id,project_id,job_id,stage_key,status,winner_attempt_id,fence_version,created_at,updated_at)
     VALUES ('task9-invocation',$1,$2,'writer','running',NULL,0,now(),now())`,
    [ids.projectA, JOB_ID],
  );
  await client.query(
    `INSERT INTO generation_attempts
       (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,'task9-invocation',0,'succeeded',now(),now(),1,'{}',now(),now())`,
    [ATTEMPT_ID, ids.projectA, JOB_ID],
  );
  await client.query(
    `UPDATE workflow_invocations
        SET status='succeeded',winner_attempt_id=$1,updated_at=now()
      WHERE id='task9-invocation'`,
    [ATTEMPT_ID],
  );
  await client.query(
    `INSERT INTO model_price_snapshots
       (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
     VALUES ('task9-price','provider','model','model',1,1,'IDR',now(),1,'{}',now())`,
  );
  await client.query(
    `INSERT INTO ai_usage_events
       (id,project_id,job_id,attempt_id,price_snapshot_id,input_tokens,output_tokens,
        provider_cost_micro_idr,charged_party,dedupe_key,created_at)
     VALUES ('task9-usage',$1,$2,$3,'task9-price',1,1,$4,'system',$5,now())`,
    [ids.projectA, JOB_ID, ATTEMPT_ID, providerCost, `usage:${ATTEMPT_ID}`],
  );
  await client.query(
    `INSERT INTO proposal_groups
       (id,project_id,kind,status,dependency_hash,created_at,updated_at)
     VALUES ('task9-group',$1,'prose','pending',$2,now(),now())`,
    [ids.projectA, 'a'.repeat(64)],
  );
  await client.query(
    `INSERT INTO generated_candidates
       (id,project_id,group_id,job_id,ordinal,schema_version,payload,created_at)
     VALUES ('task9-candidate',$1,'task9-group',$2,0,1,$3::jsonb,now())`,
    [ids.projectA, JOB_ID, JSON.stringify({ contributingAttemptIds: [ATTEMPT_ID] })],
  );
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,source_candidate_id,status,revision,content,content_hash,created_at)
     VALUES ($1,$2,$3,'task9-candidate','draft',0,'usable text',$4,now())`,
    [OUTPUT_REF, ids.projectA, ids.beatA, 'b'.repeat(64)],
  );
  await client.query(
    `UPDATE generated_candidates SET prose_version_id=$1 WHERE id='task9-candidate'`,
    [OUTPUT_REF],
  );
}

const sentinel = {
  aggregateType: 'generation_job',
  aggregateId: JOB_ID,
  eventType: 'generation_job.published',
  dedupeKey: `job-published:${JOB_ID}`,
  payload: { evidence: 'task9' },
} as const;

schema.test(
  'usable output settles eligible winner cost and commits Tx P atomically',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 600n, 1_000n);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      expect(claim.kind).toBe('claimed');
      if (claim.kind !== 'claimed') throw new Error('job not claimed');

      await expect(
        service.withFencedPublish(
          claim.identity,
          ({ appendSentinel }) => appendSentinel(sentinel),
          { settleUsableOutput: true },
        ),
      ).resolves.toMatchObject({ kind: 'published', job: { status: 'succeeded' } });

      const result = await client.query(
        `SELECT r.status,r.settled_micro_idr::text,r.released_micro_idr::text,r.exposure_micro_idr::text,
              a.provider_cost_micro_idr::text,a.user_settlement_micro_idr::text,a.system_subsidy_micro_idr::text,
              a.usable_output_kind,a.usable_output_ref,
              (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=r.id AND entry_type='reservation_settlement') AS settlements,
              (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=r.id AND entry_type='release') AS releases,
              (SELECT count(*)::int FROM outbox_events WHERE aggregate_id=$1) AS outbox_count
         FROM credit_reservations r
         JOIN credit_billing_allocations a ON a.reservation_id=r.id
        WHERE r.id=$2`,
        [JOB_ID, RESERVATION_ID],
      );
      expect(result.rows[0]).toMatchObject({
        status: 'settled',
        settled_micro_idr: '600',
        released_micro_idr: '400',
        exposure_micro_idr: '0',
        provider_cost_micro_idr: '600',
        user_settlement_micro_idr: '600',
        system_subsidy_micro_idr: '0',
        usable_output_kind: 'prose_version',
        usable_output_ref: OUTPUT_REF,
        settlements: 1,
        releases: 1,
        outbox_count: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'usable output with unresolved attempt settles only charge and preserves remainder exposure',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 600n, 1_000n);
    await client.query(
      `INSERT INTO generation_attempts
         (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
       VALUES ('task9-unresolved',$1,$2,'task9-invocation',1,'started',now(),NULL,1,'{}',now(),now())`,
      [ids.projectA, JOB_ID],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(claim.identity, async () => undefined, {
          settleUsableOutput: true,
        }),
      ).resolves.toMatchObject({ kind: 'published', job: { status: 'succeeded' } });

      expect(
        (
          await client.query(
            `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
                    closing_at IS NOT NULL AS has_closing_at,
                    (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1 AND entry_type='release') AS releases
               FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID],
          )
        ).rows[0],
      ).toMatchObject({
        status: 'closing',
        settled_micro_idr: '600',
        released_micro_idr: '0',
        exposure_micro_idr: '400',
        has_closing_at: true,
        releases: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'overage hard-caps user settlement and writes one durable incident',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 1_400n, 1_000n);
    await client.query(
      `INSERT INTO generation_attempts
         (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
       VALUES ('task9-cap-unresolved',$1,$2,'task9-invocation',1,'started',now(),NULL,1,'{}',now(),now())`,
      [ids.projectA, JOB_ID],
    );
    const before = await client.query(`SELECT now() AS value`);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await service.withFencedPublish(claim.identity, async () => undefined, {
        settleUsableOutput: true,
      });

      const result = await client.query(
        `SELECT a.provider_cost_micro_idr::text,a.user_settlement_micro_idr::text,a.system_subsidy_micro_idr::text,
              r.status,r.settled_micro_idr::text,r.released_micro_idr::text,r.exposure_micro_idr::text,
              r.closing_at >= $2::timestamptz AS pg_closing_at,
              (SELECT count(*)::int FROM outbox_events WHERE dedupe_key LIKE 'incident:credit-overage:%') AS incidents,
              (SELECT charged_party FROM ai_usage_events WHERE attempt_id=$1) AS charged_party
         FROM credit_billing_allocations a
         JOIN credit_reservations r ON r.id=a.reservation_id`,
        [ATTEMPT_ID, before.rows[0].value],
      );
      expect(result.rows[0]).toMatchObject({
        provider_cost_micro_idr: '1400',
        user_settlement_micro_idr: '1000',
        system_subsidy_micro_idr: '400',
        status: 'settled',
        settled_micro_idr: '1000',
        released_micro_idr: '0',
        exposure_micro_idr: '0',
        pg_closing_at: true,
        incidents: 1,
        charged_party: 'system',
      });

      const beforeLate = await client.query(
        `SELECT status,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,
                (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger
           FROM credit_reservations WHERE id=$1`,
        [RESERVATION_ID],
      );
      const invocations = createWorkflowInvocationService(createUnitOfWork(prisma));
      await expect(
        invocations.finalizeAttempt({
          ...claim.identity,
          leaseToken: leaseTokens.stale,
          invocationId: 'task9-invocation',
          attemptId: 'task9-cap-unresolved',
          status: 'failed',
          providerRequestId: 'task9-cap-late-provider',
          resultHash: null,
          schemaVersion: 1,
          payload: { late: true },
          usage: {
            priceSnapshotId: 'task9-price',
            inputTokens: 1,
            outputTokens: 1,
            providerCostMicroIdr: 50n,
          },
        }),
      ).resolves.toMatchObject({ kind: 'finalized', winner: 'ineligible_owner' });
      const afterLate = await client.query(
        `SELECT status,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,
                (SELECT count(*)::int FROM credit_ledger WHERE reservation_id=$1) ledger
           FROM credit_reservations WHERE id=$1`,
        [RESERVATION_ID],
      );
      expect(afterLate.rows[0]).toEqual(beforeLate.rows[0]);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'allocation committed replay requires deterministic ID and divergent new ID conflicts',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 600n, 1_000n);
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const dedupeKey = `allocation:${RESERVATION_ID}:prose_version:${OUTPUT_REF}` as const;
    const input = {
      id: dedupeKey,
      projectId: ids.projectA,
      jobId: JOB_ID,
      reservationId: RESERVATION_ID,
      usableOutputKind: 'prose_version',
      usableOutputRef: OUTPUT_REF,
      contributingAttemptIds: [ATTEMPT_ID],
      providerCostMicroIdr: 600n,
      userSettlementMicroIdr: 600n,
      systemSubsidyMicroIdr: 0n,
      dedupeKey,
    } as const;
    try {
      const append = (value: typeof input | ({ readonly id: string } & Omit<typeof input, 'id'>)) =>
        unitOfWork.execute(async (ports) => {
          const allocation = ports.creditBillingAllocation;
          if (allocation === undefined) throw new Error('allocation port missing');
          return allocation.appendForUsableOutput(value);
        });
      await expect(append(input)).resolves.toEqual({
        kind: 'appended',
        allocationId: dedupeKey,
      });
      await expect(append(input)).resolves.toEqual({
        kind: 'replayed',
        allocationId: dedupeKey,
      });
      await expect(append({ ...input, id: 'different-allocation-id' })).resolves.toEqual({
        kind: 'conflict',
      });
      await expect(
        append({ ...input, userSettlementMicroIdr: 500n, systemSubsidyMicroIdr: 100n }),
      ).resolves.toEqual({ kind: 'conflict' });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM credit_billing_allocations`))
          .rows[0],
      ).toEqual({ count: 1 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'paid sentinel zero-output closes bound reservation with zero charge',
  async ({ client, databaseUrl }) => {
    await seedPlanningGraph(client);
    await insertQueuedJobRow(client, {
      id: JOB_ID,
      projectId: ids.projectA,
      kind: 'scene_generation',
    });
    await insertReservationBinding(client, {
      reservationId: RESERVATION_ID,
      jobId: JOB_ID,
      projectId: ids.projectA,
      userId: ids.userA,
      reservedMicroIdr: 1_000n,
    });
    await client.query(
      `UPDATE credit_reservations SET job_project_id=$1,funding_model='user_paid' WHERE id=$2`,
      [ids.projectA, RESERVATION_ID],
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(
          claim.identity,
          ({ appendSentinel }) => appendSentinel(sentinel),
          {
            settleUsableOutput: true,
          },
        ),
      ).resolves.toMatchObject({ kind: 'published' });
      expect(
        (
          await client.query(
            `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
                  (SELECT count(*)::int FROM credit_billing_allocations) allocations,
                  (SELECT count(*)::int FROM credit_ledger) ledger
             FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID],
          )
        ).rows[0],
      ).toEqual({
        status: 'released',
        settled_micro_idr: '0',
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
        allocations: 0,
        ledger: 1,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'system-funded usable success closes reservation without ledger allocation or incident',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 1_400n, 1_000n);
    await client.query(`UPDATE generation_jobs SET kind='chat_intake' WHERE id=$1`, [JOB_ID]);
    await client.query(`UPDATE credit_reservations SET funding_model='system_funded' WHERE id=$1`, [
      RESERVATION_ID,
    ]);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(claim.identity, async () => undefined, {
          settleUsableOutput: true,
        }),
      ).resolves.toMatchObject({ kind: 'published' });
      expect(
        (
          await client.query(
            `SELECT status,settled_micro_idr::text,released_micro_idr::text,exposure_micro_idr::text,
                  (SELECT count(*)::int FROM credit_ledger) ledger,
                  (SELECT count(*)::int FROM credit_billing_allocations) allocations,
                  (SELECT count(*)::int FROM outbox_events WHERE dedupe_key LIKE 'incident:credit-overage:%') incidents
             FROM credit_reservations WHERE id=$1`,
            [RESERVATION_ID],
          )
        ).rows[0],
      ).toEqual({
        status: 'released',
        settled_micro_idr: '0',
        released_micro_idr: '1000',
        exposure_micro_idr: '0',
        ledger: 0,
        allocations: 0,
        incidents: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'funding marker mismatch returns typed conflict and rolls back publication',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 600n, 1_000n);
    await client.query(`UPDATE credit_reservations SET funding_model='system_funded' WHERE id=$1`, [
      RESERVATION_ID,
    ]);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(
          claim.identity,
          ({ appendSentinel }) => appendSentinel(sentinel),
          { settleUsableOutput: true },
        ),
      ).resolves.toEqual({ kind: 'funding_model_conflict' });
      expect(
        (
          await client.query(
            `SELECT j.status,r.status AS reservation_status,
                  (SELECT count(*)::int FROM credit_ledger) ledger,
                  (SELECT count(*)::int FROM credit_billing_allocations) allocations,
                  (SELECT count(*)::int FROM outbox_events) outbox
             FROM generation_jobs j JOIN credit_reservations r ON r.id=j.reservation_id
            WHERE j.id=$1`,
            [JOB_ID],
          )
        ).rows[0],
      ).toEqual({
        status: 'running',
        reservation_status: 'open',
        ledger: 0,
        allocations: 0,
        outbox: 0,
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'overage incident exact replay succeeds and divergent new ID conflicts',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 1_400n, 1_000n);
    const prisma = createPrismaForUrl(databaseUrl);
    const unitOfWork = createUnitOfWork(prisma);
    const allocationId = `allocation:${RESERVATION_ID}:prose_version:${OUTPUT_REF}`;
    const dedupeKey = `incident:credit-overage:${RESERVATION_ID}:${allocationId}` as const;
    const input = {
      id: dedupeKey,
      reservationId: RESERVATION_ID,
      allocationId,
      intendedSettlementMicroIdr: 1_400n,
      actualSettlementMicroIdr: 1_000n,
      systemSubsidyMicroIdr: 400n,
      dedupeKey,
    } as const;
    try {
      const append = (value: typeof input | ({ readonly id: string } & Omit<typeof input, 'id'>)) =>
        unitOfWork.execute(async (ports) => {
          const appendIncident = ports.outbox.appendCreditOverageIncident;
          if (appendIncident === undefined) throw new Error('incident port missing');
          return appendIncident(value);
        });
      await expect(append(input)).resolves.toEqual({ kind: 'appended' });
      await expect(append(input)).resolves.toEqual({ kind: 'replayed' });
      await expect(append({ ...input, id: 'different-incident-id' })).resolves.toEqual({
        kind: 'conflict',
      });
      await expect(append({ ...input, systemSubsidyMicroIdr: 401n })).resolves.toEqual({
        kind: 'conflict',
      });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM outbox_events`)).rows[0],
      ).toEqual({ count: 1 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  'classifier failure rolls back callback publication through separate client',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 600n, 1_000n);
    await client.query(
      `UPDATE generated_candidates SET payload='{}'::jsonb WHERE id='task9-candidate'`,
    );
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(
          claim.identity,
          ({ appendSentinel }) => appendSentinel(sentinel),
          { settleUsableOutput: true },
        ),
      ).rejects.toThrow('usable-output classifier missing contributing attempt evidence');
      expect(
        (
          await client.query(
            `SELECT j.status,(SELECT count(*)::int FROM outbox_events) outbox,
                  (SELECT count(*)::int FROM credit_billing_allocations) allocations
             FROM generation_jobs j WHERE j.id=$1`,
            [JOB_ID],
          )
        ).rows[0],
      ).toEqual({ status: 'running', outbox: 0, allocations: 0 });
    } finally {
      await prisma.$disconnect();
    }
  },
);

for (const [entryType, message] of [
  ['reservation_settlement', 'task9 settlement rollback'],
  ['release', 'task9 release rollback'],
] as const) {
  schema.test(
    `${entryType} ledger failure rolls back full Tx P through separate client`,
    async ({ client, databaseUrl }) => {
      await seedRunningSettlement(client, 600n, 1_000n);
      const suffix = entryType === 'reservation_settlement' ? 'settlement' : 'release';
      await client.query(`
    CREATE FUNCTION fail_task9_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.entry_type = '${entryType}' THEN RAISE EXCEPTION '${message}'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_task9_${suffix} BEFORE INSERT ON credit_ledger
      FOR EACH ROW EXECUTE FUNCTION fail_task9_${suffix}();
  `);
      const prisma = createPrismaForUrl(databaseUrl);
      const service = createJobService(createUnitOfWork(prisma));
      try {
        const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
        if (claim.kind !== 'claimed') throw new Error('job not claimed');
        await expect(
          service.withFencedPublish(
            claim.identity,
            ({ appendSentinel }) => appendSentinel(sentinel),
            { settleUsableOutput: true },
          ),
        ).rejects.toThrow(message);
        expect(
          (
            await client.query(
              `SELECT j.status,r.status AS reservation_status,r.settled_micro_idr::text,
                  r.released_micro_idr::text,(SELECT count(*)::int FROM credit_ledger) ledger,
                  (SELECT count(*)::int FROM credit_billing_allocations) allocations,
                  (SELECT count(*)::int FROM outbox_events) outbox
             FROM generation_jobs j JOIN credit_reservations r ON r.id=j.reservation_id
            WHERE j.id=$1`,
              [JOB_ID],
            )
          ).rows[0],
        ).toEqual({
          status: 'running',
          reservation_status: 'open',
          settled_micro_idr: '0',
          released_micro_idr: '0',
          ledger: 0,
          allocations: 0,
          outbox: 0,
        });
      } finally {
        await prisma.$disconnect();
        await client.query(`DROP TRIGGER IF EXISTS fail_task9_${suffix} ON credit_ledger`);
        await client.query(`DROP FUNCTION IF EXISTS fail_task9_${suffix}()`);
      }
    },
  );
}

schema.test(
  'job success failure rolls back allocation ledger reservation incident and publication',
  async ({ client, databaseUrl }) => {
    await seedRunningSettlement(client, 1_400n, 1_000n);
    await client.query(`
    CREATE FUNCTION fail_task9_success() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id = '${JOB_ID}' AND NEW.status = 'succeeded' THEN
        RAISE EXCEPTION 'task9 terminal rollback';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_task9_success BEFORE UPDATE ON generation_jobs
      FOR EACH ROW EXECUTE FUNCTION fail_task9_success();
  `);
    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));
    try {
      const claim = await service.claim({ leaseToken: leaseTokens.bob, leaseDurationMs: 30_000 });
      if (claim.kind !== 'claimed') throw new Error('job not claimed');
      await expect(
        service.withFencedPublish(
          claim.identity,
          ({ appendSentinel }) => appendSentinel(sentinel),
          { settleUsableOutput: true },
        ),
      ).rejects.toThrow('task9 terminal rollback');

      const counts = await client.query(
        `SELECT
         (SELECT count(*)::int FROM credit_billing_allocations) allocations,
         (SELECT count(*)::int FROM credit_ledger) ledger,
         (SELECT count(*)::int FROM outbox_events) outbox,
         (SELECT settled_micro_idr::text FROM credit_reservations WHERE id=$1) settled,
         (SELECT status FROM generation_jobs WHERE id=$2) job_status`,
        [RESERVATION_ID, JOB_ID],
      );
      expect(counts.rows[0]).toEqual({
        allocations: 0,
        ledger: 0,
        outbox: 0,
        settled: '0',
        job_status: 'running',
      });
    } finally {
      await prisma.$disconnect();
      await client.query('DROP TRIGGER IF EXISTS fail_task9_success ON generation_jobs');
      await client.query('DROP FUNCTION IF EXISTS fail_task9_success()');
    }
  },
);
