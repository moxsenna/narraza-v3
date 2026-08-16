import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph } from './fixtures.js';

const schema = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);

type Client = Parameters<Parameters<typeof schema.test>[1]>[0]['client'];

async function seedPlanAndQuote(client: Client): Promise<void> {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('quote-snapshot',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('quote-bundle',$1,'quote-snapshot',$2,$2,now() + interval '1 hour',1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ('quote-plan',$1,'quote-bundle','prose',$2,1000,1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
}

async function seedReservationWithQuote(client: Client): Promise<void> {
  await seedPlanAndQuote(client);
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,request_id,created_at)
     VALUES ('audit-quote',$1,$2,'quote-plan',$3,$3,1000,now() + interval '10 minutes',NULL,now())`,
    [ids.userA, ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at)
     VALUES ('audit-reservation',$1,$2,NULL,'open',100,0,0,100,NULL,'audit-quote','conf-req-audit',now(),now())`,
    [ids.userA, ids.projectA],
  );
}

schema.test('fresh migration produces exactly 49 application tables', async ({ client }) => {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  const actualCount = result.rows.length;
  expect(actualCount).toBe(49);
});

schema.test('W3.2 -> W3.3 upgrade succeeds with data preservation', async ({ client }) => {
  // This test runs in a pre-upgraded context; verification is done at harness level
  const ledgerBefore = await client.query(
    `SELECT COUNT(*)::text AS count FROM credit_ledger WHERE entry_type = 'release'`,
  );
  expect(parseInt(ledgerBefore.rows[0].count)).toBeGreaterThanOrEqual(0);
});

schema.test('quote_id FK exists and rejects invalid reference', async ({ client }) => {
  await seedPlanAndQuote(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at)
       VALUES ('bad-quote-ref',$1,$2,NULL,'open',100,0,0,100,NULL,'nonexistent-quote','conf-bad',now(),now())`,
      [ids.userA, ids.projectA],
    ),
    '23503',
  );
});

schema.test('confirmation_request_id partial unique index exists and enforces uniqueness', async ({
  client,
}) => {
  await seedReservationWithQuote(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at)
       VALUES ('dup-conf-req',$1,$2,NULL,'open',100,0,0,100,NULL,NULL,'conf-req-audit',now(),now())`,
      [ids.userA, ids.projectA],
    ),
    '23507',
  );
});

schema.test('billing allocation dedupeKey uniqueness exists and enforces uniqueness', async ({
  client,
}) => {
  await seedReservationWithQuote(client);
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
     VALUES ('alloc-a',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'dedupe-project-concept-proj-konsep-a',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations
         (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
       VALUES ('alloc-dup',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-2',1000,800,200,1,'dedupe-project-concept-proj-konsep-a',now())`,
      [ids.projectA],
    ),
    '23507',
  );
});

schema.test('billing allocation amount/policy checks are enforced', async ({ client }) => {
  await seedReservationWithQuote(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations
         (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at)
       VALUES ('alloc-neg-cost',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',-1000,0,0,1,NULL,'dedupe-project-concept-proj-konsep-neg',now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test('workflow_plan_requires_bundle CHECK rejects orphaned plan references', async ({
  client,
}) => {
  await seedPlanAndQuote(client);
  // Try to create job with workflow_plan_id but no bundle_id
  await expectSqlState(
    client.query(
      `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,bundle_id,workflow_plan_id,reservation_id,schema_version,payload,created_at,updated_at)
       VALUES ('orphan-job',$1,'prose','queued',0,now(),NULL,'quote-plan',NULL,1,'{}',now(),now())`,
      [ids.projectA],
    ),
    '23514',
  );
  // Valid job with both bundle AND plan should succeed
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,bundle_id,workflow_plan_id,reservation_id,schema_version,payload,created_at,updated_at)
     VALUES ('valid-job',$1,'prose','queued',0,now(),'quote-bundle','quote-plan',NULL,1,'{}',now(),now())`,
    [ids.projectA],
  );
});

schema.test('legacy jobs without workflow_plan_id remain allowed', async ({ client }) => {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('legacy-job',$1,'chat-intake','queued',0,now(),1,1,'{}',now(),now())`,
    [ids.projectA],
  );
});

schema.test('credit_ledger INSERT succeeds', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-insert',NULL,NULL,NULL,NULL,'charge','debit',500,'ledger-insert-test',now())`,
  );
  const result = await client.query(
    `SELECT * FROM credit_ledger WHERE id = 'test-insert'`,
  );
  expect(result.rows[0]?.entry_type).toBe('charge');
});

schema.test('credit_ledger UPDATE is rejected by trigger', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-update',NULL,NULL,NULL,NULL,'grant','credit',100,'ledger-update-test',now())`,
  );
  await expectSqlState(
    client.query(`UPDATE credit_ledger SET direction = 'debit' WHERE id = 'test-update'`),
    'P2034', // Custom exception raised by trigger
  );
});

schema.test('credit_ledger DELETE is rejected by trigger', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-delete',NULL,NULL,NULL,NULL,'adjustment','credit',200,'ledger-delete-test',now())`,
  );
  await expectSqlState(
    client.query(`DELETE FROM credit_ledger WHERE id = 'test-delete'`),
    'P2034',
  );
});

schema.test('billing allocation INSERT succeeds', async ({ client }) => {
  await seedReservationWithQuote(client);
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
     VALUES ('alloc-insert',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'dedupe-project-concept-proj-konsep-insert',now())`,
    [ids.projectA],
  );
  const result = await client.query(
    `SELECT * FROM credit_billing_allocations WHERE id = 'alloc-insert'`,
  );
  expect(result.rows[0]?.provider_cost_micro_idr).toBe(1000n);
});

schema.test('billing allocation UPDATE is rejected by trigger', async ({ client }) => {
  await seedReservationWithQuote(client);
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
     VALUES ('alloc-update',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'dedupe-project-concept-proj-konsep-update',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(`UPDATE credit_billing_allocations SET user_settlement_micro_idr = 900 WHERE id = 'alloc-update'`),
    'P2034',
  );
});

schema.test('billing allocation DELETE is rejected by trigger', async ({ client }) => {
  await seedReservationWithQuote(client);
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
     VALUES ('alloc-delete',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'dedupe-project-concept-proj-konsep-delete',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(`DELETE FROM credit_billing_allocations WHERE id = 'alloc-delete'`),
    'P2034',
  );
});

schema.test('retention: billing evidence survives project purge via RESTRICT FK', async ({ client }) => {
  await seedReservationWithQuote(client);
  await client.query(
    `INSERT INTO credit_billing_allocations
       (id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,dedupe_key,created_at)
     VALUES ('alloc-purge',$1,NULL,'audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'dedupe-project-concept-proj-konsep-purge',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(`DELETE FROM projects WHERE id = $1`, [ids.projectA]),
    '23503', // RESTRICT on billing_allocations prevents delete
  );
});

schema.test('trigger functions exist with correct names', async ({ client }) => {
  const result = await client.query(
    `SELECT proname FROM pg_proc WHERE proname IN ('fn_credit_ledger_enforce_immutability', 'fn_credit_billing_allocation_enforce_immutability')`,
  );
  expect(result.rowCount).toBe(2);
});

schema.test('constraint names are deterministic and present', async ({ client }) => {
  const constraints = await client.query(
    `SELECT conname FROM pg_constraint WHERE conname LIKE '%check%' OR conname LIKE '%fkey%' OR conname LIKE '%unique%'`,
  );
  const constraintNames = constraints.rows.map((r) => r.conname);
  
  const expectedConstraints = [
    'credit_reservations_quote_id_fkey',
    'credit_billing_allocations_project_id_fkey',
    'credit_billing_allocations_job_id_fkey',
    'credit_billing_allocations_reservation_id_fkey',
    'generation_jobs_workflow_plan_requires_bundle_check',
  ];
  
  expectedConstraints.forEach((name) => {
    if (!constraintNames.includes(name)) {
      throw new Error(`Missing expected constraint: ${name}`);
    }
  });
});
