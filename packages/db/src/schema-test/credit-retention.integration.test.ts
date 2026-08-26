import { createHash } from 'node:crypto';
import { createCreditRetentionService } from '@narraza/application';
import type { Pool } from 'pg';
import { expect } from 'vitest';
import { createPrismaForUrl } from '../job/job-test-fixtures.js';
import { createCreditRetentionPort } from '../repos/credit-retention-port.js';
import { createUnitOfWork } from '../unit-of-work.js';
import { ids, seedUsersAndProjects } from './fixtures.js';
import { createSchemaTestSuite } from './harness.js';

const schema = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

async function seedBase(client: Pool): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('retention-snapshot',$1,'writer','writer_safe',$2,$3,1,'{}',NOW())`,
    [ids.projectA, HASH_A, HASH_B],
  );
}

async function seedQuote(
  client: Pool,
  id: string,
  options: { age?: string; consumed?: boolean } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,
        expires_at,consumed_at,created_at)
     VALUES ($1,$2,$3,$4,$5,100,NOW() + interval '1 hour',
             CASE WHEN $6 THEN NOW() ELSE NULL END,NOW() - $7::interval)`,
    [
      id,
      ids.userA,
      ids.projectA,
      HASH_A,
      HASH_B,
      options.consumed ?? false,
      options.age ?? '25 hours',
    ],
  );
}

async function seedBundle(
  client: Pool,
  id: string,
  options: { age?: string; consumed?: boolean } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,consumed_at,
        schema_version,payload,created_at)
     VALUES ($1,$2,'retention-snapshot',$3,$4,NOW() + interval '1 hour',
             CASE WHEN $5 THEN NOW() ELSE NULL END,1,'{}',NOW() - $6::interval)`,
    [
      id,
      ids.projectA,
      HASH_A,
      createHash('sha256').update(id).digest('hex'),
      options.consumed ?? false,
      options.age ?? '25 hours',
    ],
  );
}

async function seedReservation(client: Pool, id: string, quoteId: string): Promise<void> {
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,
        released_micro_idr,exposure_micro_idr,quote_id,confirmation_request_id,created_at,updated_at)
     VALUES ($1,$2,$3,'open','user_paid',100,0,0,100,$4,$5,NOW(),NOW())`,
    [id, ids.userA, ids.projectA, quoteId, `${id}-confirmation`],
  );
}

async function seedPlan(client: Pool, id: string, bundleId: string): Promise<void> {
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,
        schema_version,payload,created_at)
     VALUES ($1,$2,$3,'concept_generation',$4,100,1,'{}',NOW())`,
    [id, ids.projectA, bundleId, HASH_A],
  );
}

async function seedJob(client: Pool, id: string, bundleId: string): Promise<void> {
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,bundle_id,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'prose','queued',0,NOW(),$3,1,'{}',NOW(),NOW())`,
    [id, ids.projectA, bundleId],
  );
}

async function sweep(
  databaseUrl: string,
  input: { maxAgeHours?: number; batchSize?: number } = {},
) {
  const prisma = createPrismaForUrl(databaseUrl);
  try {
    return await createCreditRetentionService(createUnitOfWork(prisma)).sweepCreditRetention(input);
  } finally {
    await prisma.$disconnect();
  }
}

async function exists(client: Pool, table: string, id: string): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1) AS value`,
    [id],
  );
  return Boolean((result.rows[0] as { value: boolean }).value);
}

schema.test('1. stale unused quote is deleted', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-stale');
  expect(await sweep(databaseUrl)).toEqual({ deletedQuotes: 1, deletedBundles: 0 });
  expect(await exists(client, 'credit_quotes', 'quote-stale')).toBe(false);
});

schema.test('2. fresh quote survives', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-fresh', { age: '23 hours' });
  expect((await sweep(databaseUrl)).deletedQuotes).toBe(0);
  expect(await exists(client, 'credit_quotes', 'quote-fresh')).toBe(true);
});

schema.test('3. consumed stale quote survives', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-consumed', { consumed: true });
  expect((await sweep(databaseUrl)).deletedQuotes).toBe(0);
  expect(await exists(client, 'credit_quotes', 'quote-consumed')).toBe(true);
});

schema.test('4. confirmation-linked stale quote survives', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-confirmed');
  await seedReservation(client, 'reservation-confirmed', 'quote-confirmed');
  expect((await sweep(databaseUrl)).deletedQuotes).toBe(0);
  expect(await exists(client, 'credit_quotes', 'quote-confirmed')).toBe(true);
});

schema.test('5. stale unused bundle is deleted', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedBundle(client, 'bundle-stale');
  expect(await sweep(databaseUrl)).toEqual({ deletedQuotes: 0, deletedBundles: 1 });
  expect(await exists(client, 'generation_context_bundles', 'bundle-stale')).toBe(false);
});

schema.test('6. fresh bundle survives', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedBundle(client, 'bundle-fresh', { age: '23 hours' });
  expect((await sweep(databaseUrl)).deletedBundles).toBe(0);
  expect(await exists(client, 'generation_context_bundles', 'bundle-fresh')).toBe(true);
});

schema.test('7. consumed stale bundle survives', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedBundle(client, 'bundle-consumed', { consumed: true });
  expect((await sweep(databaseUrl)).deletedBundles).toBe(0);
  expect(await exists(client, 'generation_context_bundles', 'bundle-consumed')).toBe(true);
});

schema.test(
  '8. workflow-plan-referenced stale bundle survives',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedBundle(client, 'bundle-plan');
    await seedPlan(client, 'plan-retained', 'bundle-plan');
    expect((await sweep(databaseUrl)).deletedBundles).toBe(0);
    expect(await exists(client, 'generation_context_bundles', 'bundle-plan')).toBe(true);
  },
);

schema.test(
  '9. generation-job-referenced stale bundle survives',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedBundle(client, 'bundle-job');
    await seedJob(client, 'job-retained', 'bundle-job');
    expect((await sweep(databaseUrl)).deletedBundles).toBe(0);
    expect(await exists(client, 'generation_context_bundles', 'bundle-job')).toBe(true);
  },
);

schema.test('10. credit ledger survives sweep', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-ledger-target');
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('ledger-retained',$1,$2,'grant','credit',100,'ledger-retained-dedupe',NOW() - interval '30 hours')`,
    [ids.userA, ids.projectA],
  );
  await sweep(databaseUrl);
  expect(await exists(client, 'credit_ledger', 'ledger-retained')).toBe(true);
});

schema.test('11. billing allocation survives sweep', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-allocation');
  await seedReservation(client, 'reservation-allocation', 'quote-allocation');
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,
        contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,
        system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at)
     VALUES ('allocation-retained',$1,'job-scalar','reservation-allocation','prose','output-1',
             $2,100,100,0,1,'{}','allocation-retained-dedupe',NOW() - interval '30 hours')`,
    [ids.projectA, HASH_A],
  );
  await sweep(databaseUrl);
  expect(await exists(client, 'credit_billing_allocations', 'allocation-retained')).toBe(true);
});

schema.test('12. AI usage event survives sweep', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedBundle(client, 'bundle-usage-target');
  await client.query(
    `INSERT INTO model_price_snapshots
       (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,
        output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
     VALUES ('price-retained','provider','requested','resolved',1,1,'IDR',NOW(),1,'{}',NOW())`,
  );
  await client.query(
    `INSERT INTO ai_usage_events
       (id,project_id,price_snapshot_id,input_tokens,output_tokens,provider_cost_micro_idr,
        charged_party,dedupe_key,created_at)
     VALUES ('usage-retained',$1,'price-retained',1,1,2,'system','usage-retained-dedupe',NOW() - interval '30 hours')`,
    [ids.projectA],
  );
  await sweep(databaseUrl);
  expect(await exists(client, 'ai_usage_events', 'usage-retained')).toBe(true);
});

schema.test('13. audit event survives sweep', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedQuote(client, 'quote-audit-target');
  await client.query(
    `INSERT INTO audit_events (id,user_id,action,entity_type,entity_id,metadata,created_at)
     VALUES ('audit-retained',$1,'quote_observed','CreditQuote','quote-audit-target','{}',NOW() - interval '30 hours')`,
    [ids.userA],
  );
  await sweep(databaseUrl);
  expect(await exists(client, 'audit_events', 'audit-retained')).toBe(true);
});

schema.test('14. outbox event survives sweep', async ({ client, databaseUrl }) => {
  await seedBase(client);
  await seedBundle(client, 'bundle-outbox-target');
  await client.query(
    `INSERT INTO outbox_events
       (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
     VALUES ('outbox-retained','CreditQuote','quote-scalar','retention-test','outbox-retained-dedupe',
             NOW(),1,'{}',NOW() - interval '30 hours')`,
  );
  await sweep(databaseUrl);
  expect(await exists(client, 'outbox_events', 'outbox-retained')).toBe(true);
});

schema.test(
  '15. concurrent sweepers skip locked rows without double delete or deadlock',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    for (let index = 0; index < 6; index += 1) {
      await seedQuote(client, `quote-concurrent-${index}`);
      await seedBundle(client, `bundle-concurrent-${index}`);
    }
    const [first, second] = await Promise.all([
      sweep(databaseUrl, { batchSize: 3 }),
      sweep(databaseUrl, { batchSize: 3 }),
    ]);
    expect(first.deletedQuotes + second.deletedQuotes).toBe(6);
    expect(first.deletedBundles + second.deletedBundles).toBe(6);
  },
);

schema.test(
  '16. quote confirmation race preserves legal confirmation outcome',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, 'quote-race');
    const confirmer = await client.connect();
    try {
      await confirmer.query('BEGIN');
      await confirmer.query(`SELECT id FROM credit_quotes WHERE id = 'quote-race' FOR UPDATE`);
      const sweeping = sweep(databaseUrl);
      await confirmer.query(
        `UPDATE credit_quotes SET consumed_at = clock_timestamp() WHERE id = 'quote-race'`,
      );
      await confirmer.query(
        `INSERT INTO credit_reservations
         (id,user_id,project_id,status,funding_model,reserved_micro_idr,settled_micro_idr,
          released_micro_idr,exposure_micro_idr,quote_id,confirmation_request_id,created_at,updated_at)
       VALUES ('reservation-race',$1,$2,'open','user_paid',100,0,0,100,'quote-race',
               'confirmation-race',NOW(),NOW())`,
        [ids.userA, ids.projectA],
      );
      await confirmer.query('COMMIT');
      expect((await sweeping).deletedQuotes).toBe(0);
    } finally {
      await confirmer.query('ROLLBACK').catch(() => undefined);
      confirmer.release();
    }
    expect(await exists(client, 'credit_quotes', 'quote-race')).toBe(true);
    expect(await exists(client, 'credit_reservations', 'reservation-race')).toBe(true);
  },
);

schema.test(
  '17. bundle reference race preserves legal plan outcome',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedBundle(client, 'bundle-race');
    const planner = await client.connect();
    try {
      await planner.query('BEGIN');
      await planner.query(
        `SELECT id FROM generation_context_bundles WHERE id = 'bundle-race' FOR UPDATE`,
      );
      const sweeping = sweep(databaseUrl);
      await planner.query(
        `INSERT INTO ai_workflow_plans
         (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,
          schema_version,payload,created_at)
       VALUES ('plan-race',$1,'bundle-race','concept_generation',$2,100,1,'{}',NOW())`,
        [ids.projectA, HASH_A],
      );
      await planner.query('COMMIT');
      expect((await sweeping).deletedBundles).toBe(0);
    } finally {
      await planner.query('ROLLBACK').catch(() => undefined);
      planner.release();
    }
    expect(await exists(client, 'generation_context_bundles', 'bundle-race')).toBe(true);
    expect(await exists(client, 'ai_workflow_plans', 'plan-race')).toBe(true);
  },
);

schema.test(
  '18. batch size applies separately to quotes and bundles in stable bounded batches',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    for (let index = 0; index < 4; index += 1) {
      await seedQuote(client, `quote-batch-${index}`);
      await seedBundle(client, `bundle-batch-${index}`);
    }
    expect(await sweep(databaseUrl, { batchSize: 2 })).toEqual({
      deletedQuotes: 2,
      deletedBundles: 2,
    });
    expect(await sweep(databaseUrl, { batchSize: 2 })).toEqual({
      deletedQuotes: 2,
      deletedBundles: 2,
    });
  },
);

schema.test(
  '19. strict older-than boundary uses one PostgreSQL transaction clock',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    const prisma = createPrismaForUrl(databaseUrl);
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO credit_quotes
           (id,user_id,project_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,
            expires_at,created_at)
         VALUES ('quote-boundary',$1,$2,$3,$4,100,NOW(),NOW() - interval '24 hours'),
                ('quote-over-boundary',$1,$2,$3,$4,100,NOW(),NOW() - interval '24 hours 1 millisecond')`,
          ids.userA,
          ids.projectA,
          HASH_A,
          HASH_B,
        );
        return createCreditRetentionPort(tx).deleteEligible({ maxAgeHours: 24, batchSize: 100 });
      });
      expect(result.deletedQuotes).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
    expect(await exists(client, 'credit_quotes', 'quote-boundary')).toBe(true);
    expect(await exists(client, 'credit_quotes', 'quote-over-boundary')).toBe(false);
  },
);

schema.test(
  '20. replay is idempotent after eligible rows are gone',
  async ({ client, databaseUrl }) => {
    await seedBase(client);
    await seedQuote(client, 'quote-replay-retention');
    await seedBundle(client, 'bundle-replay-retention');
    expect(await sweep(databaseUrl)).toEqual({ deletedQuotes: 1, deletedBundles: 1 });
    expect(await sweep(databaseUrl)).toEqual({ deletedQuotes: 0, deletedBundles: 0 });
  },
);
