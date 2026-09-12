import { expect } from 'vitest';
import { createCreditQuoteService, createJobService } from '@narraza/application';
import { createUnitOfWork } from '../unit-of-work.js';
import { createSchemaTestSuite } from '../schema-test/harness.js';
import { ids, seedUsersAndProjects } from '../schema-test/fixtures.js';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';

const schema = createSchemaTestSuite();

const VALID_HASH_A = 'a'.repeat(64);
const VALID_HASH_B = 'b'.repeat(64);

async function seedWorkflowPlanFixture(client: Parameters<typeof seedUsersAndProjects>[0]) {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('quote-snap-1',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
    [ids.projectA, VALID_HASH_B],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('quote-bun-1',$1,'quote-snap-1',$2,$2,now() + interval '1 hour',1,'{}',now())`,
    [ids.projectA, VALID_HASH_B],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ('quote-plan-1',$1,'quote-bun-1','prose',$2,50000,1,'{}',now())`,
    [ids.projectA, VALID_HASH_A],
  );
}

schema.test(
  '1 & 2. exact quote issuance tuple with PostgreSQL 10-minute expiry',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      const result = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-exact-1',
      });

      expect(result.kind).toBe('issued');
      if (result.kind === 'issued') {
        expect(result.isReplay).toBe(false);
        expect(result.quote.userId).toBe(ids.userA);
        expect(result.quote.projectId).toBe(ids.projectA);
        expect(result.quote.workflowPlanId).toBe('quote-plan-1');
        expect(result.quote.workflowPlanHash).toBe(VALID_HASH_A);
        expect(result.quote.dependencyHash).toBe(VALID_HASH_B);
        expect(result.quote.maxAmountMicroIdr).toBe(50_000n);
        expect(result.quote.consumedAt).toBeNull();
        expect(result.quote.requestId).toBe('req-quote-exact-1');

        // Check PostgreSQL 10-minute expiry (approx 600s difference between created_at and expires_at)
        const row = (
          await client.query(
            `SELECT EXTRACT(EPOCH FROM (expires_at - created_at))::int AS diff_seconds
               FROM credit_quotes WHERE id = $1`,
            [result.quote.id],
          )
        ).rows[0];
        expect(row.diff_seconds).toBe(600);
      }
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '3. exact issuanceRequestId replay returns existing quote',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      const input = {
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-replay-test',
      };

      const first = await quoteService.issueQuote(input);
      expect(first.kind).toBe('issued');
      if (first.kind !== 'issued') throw new Error('unreachable');
      expect(first.isReplay).toBe(false);

      const second = await quoteService.issueQuote(input);
      expect(second.kind).toBe('issued');
      if (second.kind !== 'issued') throw new Error('unreachable');
      expect(second.isReplay).toBe(true);
      expect(second.quote.id).toBe(first.quote.id);
      expect(second.quote.createdAt).toEqual(first.quote.createdAt);

      const quoteCount = (
        await client.query(
          `SELECT count(*)::int AS count FROM credit_quotes WHERE request_id = $1`,
          ['req-quote-replay-test'],
        )
      ).rows[0].count;
      expect(quoteCount).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '4. divergent issuanceRequestId replay returns typed conflict',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      const first = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-divergent-test',
      });
      expect(first.kind).toBe('issued');

      // Divergent call with different amount under same issuanceRequestId
      const second = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 75_000n, // Changed amount
        issuanceRequestId: 'req-quote-divergent-test',
      });
      expect(second).toEqual({ kind: 'conflict' });

      // Divergent call with different bundleId under same issuanceRequestId
      const third = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-other', // Changed bundle
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-divergent-test',
      });
      expect(third).toEqual({ kind: 'conflict' });
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '5. owner/project non-enumeration returns not_found and writes zero rows',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      // User B trying to issue quote on User A's project
      const result = await quoteService.issueQuote({
        userId: ids.userB,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-foreign-1',
      });

      expect(result).toEqual({ kind: 'not_found' });

      const quoteCount = (
        await client.query(
          `SELECT count(*)::int AS count FROM credit_quotes WHERE request_id = $1`,
          ['req-quote-foreign-1'],
        )
      ).rows[0].count;
      expect(quoteCount).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '6, 7 & 8. invalid inputs write zero quote rows to DB',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      // Zero amount
      const resZero = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 0n,
        issuanceRequestId: 'req-quote-zero',
      });
      expect(resZero).toEqual({ kind: 'invalid_quote_amount', amount: 0n });

      // Negative amount
      const resNeg = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: -500n,
        issuanceRequestId: 'req-quote-neg',
      });
      expect(resNeg).toEqual({ kind: 'invalid_quote_amount', amount: -500n });

      // Invalid hash
      const resBadHash = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: 'NOT_HEX_64',
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-bad-hash',
      });
      expect(resBadHash).toEqual({ kind: 'invalid_hash', field: 'workflowPlanHash' });

      // Plan / Bundle mismatch
      const resMismatch = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-wrong',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-mismatch',
      });
      expect(resMismatch).toEqual({ kind: 'invalid_bundle_binding' });

      // Missing bundleId when workflowPlanId is provided
      const resMissingBun = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: null,
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-missing-bun',
      });
      expect(resMissingBun).toEqual({ kind: 'invalid_bundle_binding' });

      // Missing workflowPlanId when bundleId is provided
      const resMissingPlan = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: null,
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-missing-plan',
      });
      expect(resMissingPlan).toEqual({ kind: 'invalid_bundle_binding' });

      const totalQuotes = (await client.query(`SELECT count(*)::int AS count FROM credit_quotes`))
        .rows[0].count;
      expect(totalQuotes).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '9 & 10. paid vs system-funded actions and quote admission boundaries',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma = createPrismaForUrl(databaseUrl);
    const uow = createUnitOfWork(prisma);
    const quoteService = createCreditQuoteService(uow);

    try {
      // System funded action (chat_intake) -> rejected with not_applicable
      const sysQuote = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'chat_intake',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 10_000n,
        issuanceRequestId: 'req-sys-quote',
      });
      expect(sysQuote).toEqual({ kind: 'not_applicable', fundingModel: 'system_funded' });

      // Pre-D4 legacy action (prose) -> rejected with not_applicable
      const legacyQuote = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'prose',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 10_000n,
        issuanceRequestId: 'req-legacy-quote',
      });
      expect(legacyQuote).toEqual({ kind: 'not_applicable', fundingModel: 'pre_d4_legacy' });

      // Unknown action -> rejected with funding_model_violation
      const unknownQuote = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'unmapped_job_kind',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 10_000n,
        issuanceRequestId: 'req-unknown-quote',
      });
      expect(unknownQuote).toEqual({ kind: 'funding_model_violation', reason: 'unknown_kind' });

      // User-paid action (concept_generation) -> issued
      const paidQuote = await quoteService.issueQuote({
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 10_000n,
        issuanceRequestId: 'req-paid-action-quote',
      });
      expect(paidQuote.kind).toBe('issued');

      // Check DB quote count
      const quotes = (await client.query(`SELECT id, user_id, project_id FROM credit_quotes`)).rows;
      expect(quotes).toHaveLength(1);
      expect(quotes[0].user_id).toBe(ids.userA);

      // Verify that no generation job or reservation was created by quote issuance
      const jobs = (await client.query(`SELECT count(*)::int AS count FROM generation_jobs`))
        .rows[0].count;
      const reservations = (
        await client.query(`SELECT count(*)::int AS count FROM credit_reservations`)
      ).rows[0].count;
      expect(jobs).toBe(0);
      expect(reservations).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '11-17. funding model enqueue guard and reservation binding states on PostgreSQL',
  async ({ client, databaseUrl }) => {
    await seedUsersAndProjects(client);

    // 1. Seed a failed user_paid job (concept_generation)
    await client.query(
      `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('paid-failed-job',$1,'concept_generation','failed',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );

    // 2. Seed a failed system_funded job (chat_intake)
    await client.query(
      `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('sys-failed-job',$1,'chat_intake','failed',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );

    // 3. Seed open user reservation (funding model durable per Amendment #16)
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('user-open-res',$1,$2,'open','user_paid',5000,0,0,5000,now(),now())`,
      [ids.userA, ids.projectA],
    );

    // 4. Seed open system reservation (funding model durable per Amendment #16)
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('sys-upstream-res',$1,$2,'open','system_funded',1000,0,0,1000,now(),now())`,
      [ids.userA, ids.projectA],
    );

    // 5. Seed settled (closed) reservation
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,created_at,updated_at)
       VALUES ('closed-res',$1,$2,'settled','user_paid',1000,1000,0,0,now(),now(),now())`,
      [ids.userA, ids.projectA],
    );

    // 6. Seed already-bound reservation (user_paid, bound to the paid job)
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,job_project_id,job_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('bound-res',$1,$2,$2,'paid-failed-job','open','user_paid',1000,0,0,1000,now(),now())`,
      [ids.userA, ids.projectA],
    );

    // 7. Seed foreign project reservation
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('foreign-res',$1,$2,'open','user_paid',1000,0,0,1000,now(),now())`,
      [ids.userB, ids.projectB],
    );

    const prisma = createPrismaForUrl(databaseUrl);
    const service = createJobService(createUnitOfWork(prisma));

    try {
      // 11. user_paid retry with null reservation -> funding_model_violation + 0 insert
      const paidResNull = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: null,
      });
      expect(paidResNull).toEqual({
        kind: 'funding_model_violation',
        reason: 'missing_reservation_for_paid',
        fundingModel: 'user_paid',
      });

      // 12. system_funded retry with null reservation -> funding_model_violation + 0 insert
      const sysResNull = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'sys-failed-job',
        availableInMs: 0,
        reservationId: null,
      });
      expect(sysResNull).toEqual({
        kind: 'funding_model_violation',
        reason: 'missing_reservation_for_system_funded',
        fundingModel: 'system_funded',
      });

      // 13. retry with closed reservation -> reservation_binding_invalid
      const closedResRetry = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: 'closed-res',
      });
      expect(closedResRetry).toEqual({ kind: 'reservation_binding_invalid' });

      // 14. retry with already-bound reservation -> reservation_binding_invalid
      const boundResRetry = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: 'bound-res',
      });
      expect(boundResRetry).toEqual({ kind: 'reservation_binding_invalid' });

      // 15. retry with foreign project reservation -> reservation_binding_invalid
      const foreignResRetry = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: 'foreign-res',
      });
      expect(foreignResRetry).toEqual({ kind: 'reservation_binding_invalid' });

      // 15a. user_paid job cannot bind a system_funded reservation (Amendment #16)
      const crossPaidToSys = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: 'sys-upstream-res',
      });
      expect(crossPaidToSys).toEqual({ kind: 'funding_model_mismatch' });

      // 15b. system_funded job cannot bind a user_paid reservation (Amendment #16)
      const crossSysToPaid = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'sys-failed-job',
        availableInMs: 0,
        reservationId: 'user-open-res',
      });
      expect(crossSysToPaid).toEqual({ kind: 'funding_model_mismatch' });

      // Cross-funding rejections must write zero job/reservation/ledger mutation
      const sysResAfterCross = (
        await client.query(
          `SELECT status,funding_model,job_id,job_project_id FROM credit_reservations WHERE id='sys-upstream-res'`,
        )
      ).rows[0];
      expect(sysResAfterCross).toEqual({
        status: 'open',
        funding_model: 'system_funded',
        job_id: null,
        job_project_id: null,
      });
      const paidResAfterCross = (
        await client.query(
          `SELECT status,funding_model,job_id,job_project_id FROM credit_reservations WHERE id='user-open-res'`,
        )
      ).rows[0];
      expect(paidResAfterCross).toEqual({
        status: 'open',
        funding_model: 'user_paid',
        job_id: null,
        job_project_id: null,
      });
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM generation_jobs`)).rows[0].count,
      ).toBe(2); // only the two seeded failed jobs; no retry jobs created
      expect(
        (await client.query(`SELECT count(*)::int AS count FROM credit_ledger`)).rows[0].count,
      ).toBe(0);

      // 16. user_paid retry with valid open reservation -> succeeds and binds reservation
      const paidAllowed = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'paid-failed-job',
        availableInMs: 0,
        reservationId: 'user-open-res',
      });
      expect(paidAllowed.kind).toBe('created');
      if (paidAllowed.kind === 'created') {
        expect(paidAllowed.job.kind).toBe('concept_generation');
        expect(paidAllowed.job.reservationId).toBe('user-open-res');
      }

      // 17. system_funded retry with valid upstream open reservation -> succeeds and binds reservation
      const sysAllowed = await service.manualRetry({
        projectId: ids.projectA,
        sourceJobId: 'sys-failed-job',
        availableInMs: 0,
        reservationId: 'sys-upstream-res',
      });
      expect(sysAllowed.kind).toBe('created');
      if (sysAllowed.kind === 'created') {
        expect(sysAllowed.job.kind).toBe('chat_intake');
        expect(sysAllowed.job.reservationId).toBe('sys-upstream-res');
      }

      // Verify zero quotes and zero ledger entries created by retries
      const totalQuotes = (await client.query(`SELECT count(*)::int AS count FROM credit_quotes`))
        .rows[0].count;
      const totalLedger = (await client.query(`SELECT count(*)::int AS count FROM credit_ledger`))
        .rows[0].count;
      expect(totalQuotes).toBe(0);
      expect(totalLedger).toBe(0);

      // Verify exactly two retry jobs created in DB
      const retries = (
        await client.query(
          `SELECT count(*)::int AS count FROM generation_jobs WHERE retry_of_job_id IS NOT NULL`,
        )
      ).rows[0].count;
      expect(retries).toBe(2);
    } finally {
      await prisma.$disconnect();
    }
  },
);

schema.test(
  '18. exact replay under concurrent duplicate issuance on PostgreSQL',
  async ({ client, databaseUrl }) => {
    await seedWorkflowPlanFixture(client);
    const prisma1 = createPrismaForUrl(databaseUrl);
    const prisma2 = createPrismaForUrl(databaseUrl);
    const quoteService1 = createCreditQuoteService(createUnitOfWork(prisma1));
    const quoteService2 = createCreditQuoteService(createUnitOfWork(prisma2));

    try {
      const input = {
        userId: ids.userA,
        projectId: ids.projectA,
        actionKind: 'concept_generation',
        workflowPlanId: 'quote-plan-1',
        workflowPlanHash: VALID_HASH_A,
        bundleId: 'quote-bun-1',
        dependencyHash: VALID_HASH_B,
        maxAmountMicroIdr: 50_000n,
        issuanceRequestId: 'req-quote-concurrent-test',
      };

      // Execute concurrent quote issuance with exact same input
      const [res1, res2] = await Promise.all([
        quoteService1.issueQuote(input),
        quoteService2.issueQuote(input),
      ]);

      expect(res1.kind).toBe('issued');
      expect(res2.kind).toBe('issued');
      if (res1.kind === 'issued' && res2.kind === 'issued') {
        // Both point to the exact same persisted quote ID
        expect(res1.quote.id).toBe(res2.quote.id);
        // One is the initial insert, the other is replayed
        const replayFlags = [res1.isReplay, res2.isReplay].sort();
        expect(replayFlags).toEqual([false, true]);
      }

      const totalQuotes = (
        await client.query(
          `SELECT count(*)::int AS count FROM credit_quotes WHERE request_id = $1`,
          ['req-quote-concurrent-test'],
        )
      ).rows[0].count;
      expect(totalQuotes).toBe(1);
    } finally {
      await prisma1.$disconnect();
      await prisma2.$disconnect();
    }
  },
);
