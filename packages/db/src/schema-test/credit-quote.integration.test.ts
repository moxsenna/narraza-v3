import type { ConfirmQuoteResult, CreateConfirmationInput } from '@narraza/application';
import { createCreditQuoteConfirmationService } from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { ids, seedUsersAndProjects } from './fixtures.js';
import { createSchemaTestSuite } from './harness.js';
import { createUnitOfWork } from '../unit-of-work.js';

const schema = createSchemaTestSuite();
const WORKFLOW_HASH = 'a'.repeat(64);
const DEPENDENCY_HASH = 'b'.repeat(64);
const OTHER_WORKFLOW_HASH = 'c'.repeat(64);
const OTHER_DEPENDENCY_HASH = 'd'.repeat(64);
const PLAN_ID = 'quote-plan-1';
const BUNDLE_ID = 'quote-bundle-1';
const PAID_KIND = 'concept_generation';

interface QuoteSeed {
  readonly id: string;
  readonly userId?: string;
  readonly projectId?: string;
  readonly maxAmountMicroIdr?: bigint;
  readonly expiresIn?: string;
  readonly consumed?: boolean;
  readonly workflowPlanHash?: string;
  readonly dependencyHash?: string;
}

async function seedBase(client: Pool, grantMicroIdr = 100_000n): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('quote-snapshot-1',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
    [ids.projectA, DEPENDENCY_HASH],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ($1,$2,'quote-snapshot-1',$3,$3,now() + interval '1 hour',1,'{}',now())`,
    [BUNDLE_ID, ids.projectA, DEPENDENCY_HASH],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ($1,$2,$3,$4,$5,50000,1,'{}',now())`,
    [PLAN_ID, ids.projectA, BUNDLE_ID, PAID_KIND, WORKFLOW_HASH],
  );
  if (grantMicroIdr > 0n) {
    await client.query(
      `INSERT INTO credit_ledger
         (id,user_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('confirmation-grant-1',$1,'grant','credit',$2,'confirmation-grant-dedupe-1',now())`,
      [ids.userA, grantMicroIdr],
    );
  }
}

async function seedQuote(client: Pool, seed: QuoteSeed): Promise<void> {
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_project_id,workflow_plan_id,workflow_plan_hash,
        dependency_hash,max_amount_micro_idr,expires_at,consumed_at,request_id,created_at)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,clock_timestamp() + $8::interval,
             CASE WHEN $9 THEN clock_timestamp() ELSE NULL END,NULL,
             clock_timestamp() - interval '1 hour')`,
    [
      seed.id,
      seed.userId ?? ids.userA,
      seed.projectId ?? ids.projectA,
      PLAN_ID,
      seed.workflowPlanHash ?? WORKFLOW_HASH,
      seed.dependencyHash ?? DEPENDENCY_HASH,
      seed.maxAmountMicroIdr ?? 50_000n,
      seed.expiresIn ?? '10 minutes',
      seed.consumed ?? false,
    ],
  );
}

function input(
  quoteId: string,
  suffix: string,
  overrides: Partial<CreateConfirmationInput> = {},
): CreateConfirmationInput {
  return {
    userId: ids.userA,
    projectId: ids.projectA,
    quoteId,
    confirmationRequestId: `confirmation-${suffix}`,
    expectedWorkflowPlanHash: WORKFLOW_HASH,
    expectedDependencyHash: DEPENDENCY_HASH,
    reservationId: `reservation-${suffix}`,
    jobId: `job-${suffix}`,
    jobKind: PAID_KIND,
    bundleId: BUNDLE_ID,
    workflowPlanId: PLAN_ID,
    payload: { request: suffix },
    ...overrides,
  };
}

async function counts(
  client: Pool,
): Promise<{ quotes: number; reservations: number; jobs: number }> {
  const row = (
    await client.query(
      `SELECT
         (SELECT count(*)::int FROM credit_quotes) AS quotes,
         (SELECT count(*)::int FROM credit_reservations) AS reservations,
         (SELECT count(*)::int FROM generation_jobs) AS jobs`,
    )
  ).rows[0] as { quotes: number; reservations: number; jobs: number };
  return row;
}

async function expectQuoteUnconsumed(client: Pool, quoteId: string): Promise<void> {
  const row = (await client.query(`SELECT consumed_at FROM credit_quotes WHERE id = $1`, [quoteId]))
    .rows[0] as { consumed_at: Date | null };
  expect(row.consumed_at).toBeNull();
}

async function withService<T>(
  databaseUrl: string,
  run: (confirm: (value: CreateConfirmationInput) => Promise<ConfirmQuoteResult>) => Promise<T>,
): Promise<T> {
  const prisma = createPrismaForUrl(databaseUrl);
  const service = createCreditQuoteConfirmationService(createUnitOfWork(prisma));
  try {
    return await run((value) => service.confirmQuote(value));
  } finally {
    await prisma.$disconnect();
  }
}

schema.test('1. first paid confirmation succeeds', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, { id: 'quote-first' });

  await withService(databaseUrl, async (confirm) => {
    const result = await confirm(input('quote-first', 'first'));
    expect(result.kind).toBe('confirmed');
    if (result.kind === 'confirmed') {
      expect(result.reservation.id).toBe('reservation-first');
      expect(result.reservation.jobId).toBe('job-first');
      expect(result.reservation.projectJobId).toBe(ids.projectA);
      expect(result.job.id).toBe('job-first');
      expect(result.job.reservationId).toBe('reservation-first');
    }
  });
  expect(await counts(client)).toEqual({ quotes: 1, reservations: 1, jobs: 1 });
});

schema.test(
  '2. exact replay returns same quote, reservation, and job IDs',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-replay' });
    const request = input('quote-replay', 'replay');

    await withService(databaseUrl, async (confirm) => {
      const first = await confirm(request);
      const second = await confirm(request);
      expect(first.kind).toBe('confirmed');
      expect(second.kind).toBe('exact_replay');
      if (first.kind === 'confirmed' && second.kind === 'exact_replay') {
        expect(second.reservation.id).toBe(first.reservation.id);
        expect(second.job.id).toBe(first.job.id);
        expect(second.reservation.quoteId).toBe('quote-replay');
      }
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 1, jobs: 1 });
  },
);

schema.test(
  '3. concurrent same request converges to one durable result',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-same-request' });
    const request = input('quote-same-request', 'same-request');

    await withService(databaseUrl, async (confirm) => {
      const results = await Promise.all([confirm(request), confirm(request)]);
      expect(results.map((result) => result.kind).sort()).toEqual(['confirmed', 'exact_replay']);
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 1, jobs: 1 });
  },
);

schema.test(
  '4. different requests against same quote produce one confirmation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-different-requests' });

    await withService(databaseUrl, async (confirm) => {
      const results = await Promise.all([
        confirm(input('quote-different-requests', 'different-a')),
        confirm(input('quote-different-requests', 'different-b')),
      ]);
      expect(results.map((result) => result.kind).sort()).toEqual([
        'already_consumed',
        'confirmed',
      ]);
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 1, jobs: 1 });
  },
);

schema.test(
  '5. two quotes with limited balance cannot overspend',
  async ({ client, databaseUrl }) => {
    await seedBase(client, 50_000n);
    await seedQuote(client, { id: 'quote-balance-a' });
    await seedQuote(client, { id: 'quote-balance-b' });

    await withService(databaseUrl, async (confirm) => {
      const results = await Promise.all([
        confirm(input('quote-balance-a', 'balance-a')),
        confirm(input('quote-balance-b', 'balance-b')),
      ]);
      expect(results.filter((result) => result.kind === 'confirmed')).toHaveLength(1);
      expect(results.filter((result) => result.kind === 'insufficient_credit')).toHaveLength(1);
    });
    expect(await counts(client)).toEqual({ quotes: 2, reservations: 1, jobs: 1 });
  },
);

schema.test(
  '6. expired quote returns typed expired with zero mutation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-expired', expiresIn: '-1 second' });

    await withService(databaseUrl, async (confirm) => {
      expect(await confirm(input('quote-expired', 'expired'))).toEqual({ kind: 'expired' });
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 0 });
    await expectQuoteUnconsumed(client, 'quote-expired');
  },
);

schema.test(
  '7. zero maximum returns invalid amount with zero mutation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-zero', maxAmountMicroIdr: 0n });

    await withService(databaseUrl, async (confirm) => {
      expect(await confirm(input('quote-zero', 'zero'))).toEqual({
        kind: 'invalid_quote_amount',
        amount: 0n,
      });
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 0 });
    await expectQuoteUnconsumed(client, 'quote-zero');
  },
);

schema.test(
  '8. wrong owner is non-enumerating with zero mutation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-owner' });

    await withService(databaseUrl, async (confirm) => {
      expect(await confirm(input('quote-owner', 'owner', { userId: ids.userB }))).toEqual({
        kind: 'not_found',
      });
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 0 });
    await expectQuoteUnconsumed(client, 'quote-owner');
  },
);

schema.test('9. workflow hash mismatch has zero mutation', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, { id: 'quote-workflow-hash' });

  await withService(databaseUrl, async (confirm) => {
    expect(
      await confirm(
        input('quote-workflow-hash', 'workflow-hash', {
          expectedWorkflowPlanHash: OTHER_WORKFLOW_HASH,
        }),
      ),
    ).toEqual({ kind: 'hash_mismatch', field: 'workflowPlanHash' });
  });
  expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 0 });
  await expectQuoteUnconsumed(client, 'quote-workflow-hash');
});

schema.test('10. dependency hash mismatch has zero mutation', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, { id: 'quote-dependency-hash' });

  await withService(databaseUrl, async (confirm) => {
    expect(
      await confirm(
        input('quote-dependency-hash', 'dependency-hash', {
          expectedDependencyHash: OTHER_DEPENDENCY_HASH,
        }),
      ),
    ).toEqual({ kind: 'hash_mismatch', field: 'dependencyHash' });
  });
  expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 0 });
  await expectQuoteUnconsumed(client, 'quote-dependency-hash');
});

schema.test(
  '11. deterministic job-ID conflict rolls back quote and reservation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-job-conflict' });
    await client.query(
      `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('job-job-conflict',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );

    await withService(databaseUrl, async (confirm) => {
      expect(await confirm(input('quote-job-conflict', 'job-conflict'))).toEqual({
        kind: 'conflict',
      });
    });
    expect(await counts(client)).toEqual({ quotes: 1, reservations: 0, jobs: 1 });
    await expectQuoteUnconsumed(client, 'quote-job-conflict');
  },
);

schema.test(
  '12. confirmation establishes reciprocal reservation and job binding',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-binding' });

    await withService(databaseUrl, async (confirm) => {
      expect((await confirm(input('quote-binding', 'binding'))).kind).toBe('confirmed');
    });
    const row = (
      await client.query(
        `SELECT r.id AS reservation_id,r.job_project_id,r.job_id,
              j.project_id AS job_project_id_row,j.id AS job_id_row,j.reservation_id AS job_reservation_id
         FROM credit_reservations r
         JOIN generation_jobs j ON j.project_id = r.job_project_id AND j.id = r.job_id
        WHERE r.id = 'reservation-binding'`,
      )
    ).rows[0];
    expect(row).toEqual({
      reservation_id: 'reservation-binding',
      job_project_id: ids.projectA,
      job_id: 'job-binding',
      job_project_id_row: ids.projectA,
      job_id_row: 'job-binding',
      job_reservation_id: 'reservation-binding',
    });
  },
);

for (const [name, jobKind, reason] of [
  ['13. known system-funded kind is rejected', 'chat_intake', 'known_ineligible_kind'],
  ['14. known legacy kind is rejected', 'prose', 'known_ineligible_kind'],
  ['15. unknown kind is rejected', 'some_new_unmapped_kind', 'unknown_kind'],
] as const) {
  schema.test(name, async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: `quote-funding-${reason}-${jobKind}` });
    const before = await counts(client);

    await withService(databaseUrl, async (confirm) => {
      expect(
        await confirm(
          input(`quote-funding-${reason}-${jobKind}`, `funding-${reason}-${jobKind}`, {
            jobKind,
          }),
        ),
      ).toEqual({ kind: 'funding_model_violation', reason });
    });
    expect(await counts(client)).toEqual(before);
    await expectQuoteUnconsumed(client, `quote-funding-${reason}-${jobKind}`);
  });
}

schema.test(
  '16. divergent confirmation request ID returns conflict without second mutation',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, { id: 'quote-divergent-a' });
    await seedQuote(client, { id: 'quote-divergent-b' });
    const first = input('quote-divergent-a', 'divergent');

    await withService(databaseUrl, async (confirm) => {
      expect((await confirm(first)).kind).toBe('confirmed');
      expect(await confirm({ ...first, quoteId: 'quote-divergent-b' })).toEqual({
        kind: 'conflict',
      });
    });
    expect(await counts(client)).toEqual({ quotes: 2, reservations: 1, jobs: 1 });
    await expectQuoteUnconsumed(client, 'quote-divergent-b');
  },
);
