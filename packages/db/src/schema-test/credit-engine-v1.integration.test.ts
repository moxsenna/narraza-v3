import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph } from './fixtures.js';

const schema = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);

type Client = Parameters<Parameters<typeof schema.test>[1]>[0]['client'];

// generation_jobs has 18 columns; every fixture INSERT must provide all of them
// in this exact order to satisfy NOT NULL available_at and payload.
const JOB_COLUMNS = `id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,fence_version,cancel_requested_at,retry_of_job_id,bundle_id,workflow_plan_id,reservation_id,schema_version,payload,created_at,updated_at`;

function jobValues(bundleId: string | null, workflowPlanId: string | null): string {
  return `($1,$2,'prose','queued',0,now(),NULL,NULL,0,NULL,NULL,${bundleId === null ? 'NULL' : `'${bundleId}'`},${workflowPlanId === null ? 'NULL' : `'${workflowPlanId}'`},NULL,1,'{}',now(),now())`;
}

// Seeds users/projects/planning graph plus the snapshot-bundle-plan triple that
// jobs and quotes reference. Must be called at most once per test because the
// harness truncates between tests and fixed IDs collide on a second call.
async function seedPlanGraph(client: Client): Promise<void> {
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

async function seedQuoteAndReservation(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,request_id,created_at)
     VALUES ('audit-quote',$1,$2,$2,'quote-plan',$3,$3,1000,now() + interval '10 minutes',NULL,now())`,
    [ids.userA, ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at)
     VALUES ('audit-reservation',$1,$2,NULL,'open',100,0,0,100,NULL,'audit-quote','conf-req-audit',now(),now())`,
    [ids.userA, ids.projectA],
  );
}

// Full billing-allocation graph: plan graph + quote + reservation + job, each
// seeded exactly once. All billing allocation fixtures go through here.
async function seedBillingFixture(client: Client, jobId: string): Promise<void> {
  await seedPlanGraph(client);
  await seedQuoteAndReservation(client);
  await client.query(
    `INSERT INTO generation_jobs (${JOB_COLUMNS})
     VALUES ${jobValues('quote-bundle', 'quote-plan')}`,
    [jobId, ids.projectA],
  );
}

function allocationColumns(): string {
  return `id,project_id,job_id,reservation_id,usable_output_kind,usable_output_ref,contributing_attempt_ids_hash,provider_cost_micro_idr,user_settlement_micro_idr,system_subsidy_micro_idr,billing_policy_version,billing_policy_payload,dedupe_key,created_at`;
}

schema.test('quote_id FK exists and rejects invalid reference', async ({ client }) => {
  await seedPlanGraph(client);
  await seedQuoteAndReservation(client);
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

schema.test(
  'confirmation_request_id partial unique index enforces uniqueness',
  async ({ client }) => {
    await seedPlanGraph(client);
    await seedQuoteAndReservation(client);
    await expectSqlState(
      client.query(
        `INSERT INTO credit_reservations
         (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,quote_id,confirmation_request_id,created_at,updated_at)
       VALUES ('dup-conf-req',$1,$2,NULL,'open',100,0,0,100,NULL,NULL,'conf-req-audit',now(),now())`,
        [ids.userA, ids.projectA],
      ),
      '23505',
    );
  },
);

schema.test('billing allocation dedupeKey uniqueness is enforced', async ({ client }) => {
  await seedBillingFixture(client, 'alloc-dedupe');
  await client.query(
    `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-a',$1,'alloc-dedupe','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-a',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
       VALUES ('alloc-dup',$1,'alloc-dedupe','audit-reservation','konsep','proj-konsep-a','hash-try-2',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-a',now())`,
      [ids.projectA],
    ),
    '23505',
  );
});

schema.test('billing allocation amount/policy checks are enforced', async ({ client }) => {
  await seedBillingFixture(client, 'alloc-checks');
  // Negative provider cost violates provider_cost >= 0
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
       VALUES ('alloc-neg-cost',$1,'alloc-checks','audit-reservation','konsep','proj-konsep-a','hash-try-1',-1000,0,0,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-neg',now())`,
      [ids.projectA],
    ),
    '23514',
  );
  // Non-object JSONB payload violates jsonb_typeof = 'object'
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
       VALUES ('alloc-bad-payload',$1,'alloc-checks','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'"string"'::jsonb,'dedupe-project-concept-proj-konsep-str',now())`,
      [ids.projectA],
    ),
    '23514',
  );
  // Subsidy not equal to GREATEST(provider - user, 0) violates conservation
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
       VALUES ('alloc-bad-conservation',$1,'alloc-checks','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,500,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-bad',now())`,
      [ids.projectA],
    ),
    '23514',
  );
  // Zero policy version violates billing_policy_version > 0
  await expectSqlState(
    client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
       VALUES ('alloc-zero-policy',$1,'alloc-checks','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,0,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-zero',now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test(
  'billing allocation conservation accepts subsidy floored at zero',
  async ({ client }) => {
    await seedBillingFixture(client, 'alloc-floor');
    // user settlement exceeds provider cost: subsidy must be floored at 0
    await client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-floor',$1,'alloc-floor','audit-reservation','konsep','proj-konsep-a','hash-try-1',800,1000,0,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-floor',now())`,
      [ids.projectA],
    );
    const result = await client.query(
      `SELECT system_subsidy_micro_idr::text AS subsidy FROM credit_billing_allocations WHERE id = 'alloc-floor'`,
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.subsidy).toBe('0');
  },
);

schema.test(
  'workflow_plan_requires_bundle CHECK rejects orphaned plan references',
  async ({ client }) => {
    await seedPlanGraph(client);
    // workflow_plan_id set while bundle_id is NULL violates the CHECK
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs (${JOB_COLUMNS})
       VALUES ${jobValues(null, 'quote-plan')}`,
        ['orphan-job', ids.projectA],
      ),
      '23514',
    );
    // Job with both bundle and plan is accepted
    await client.query(
      `INSERT INTO generation_jobs (${JOB_COLUMNS})
     VALUES ${jobValues('quote-bundle', 'quote-plan')}`,
      ['valid-job', ids.projectA],
    );
  },
);

schema.test('legacy jobs without workflow_plan_id remain allowed', async ({ client }) => {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO generation_jobs (${JOB_COLUMNS})
     VALUES ${jobValues(null, null)}`,
    ['legacy-job', ids.projectA],
  );
});

schema.test('credit_ledger INSERT succeeds with grant vocabulary', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-insert-grant',NULL,NULL,NULL,NULL,'grant','credit',500,'ledger-grant-test',now())`,
  );
  const result = await client.query(`SELECT * FROM credit_ledger WHERE id = 'test-insert-grant'`);
  expect(result.rows[0]?.entry_type).toBe('grant');
});

schema.test('credit_ledger UPDATE is rejected by immutability trigger', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-update',NULL,NULL,NULL,NULL,'grant','credit',100,'ledger-update-test',now())`,
  );
  await expectSqlState(
    client.query(`UPDATE credit_ledger SET direction = 'debit' WHERE id = 'test-update'`),
    'P2034',
  );
});

schema.test('credit_ledger DELETE is rejected by immutability trigger', async ({ client }) => {
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('test-delete',NULL,NULL,NULL,NULL,'adjustment','credit',200,'ledger-delete-test',now())`,
  );
  await expectSqlState(client.query(`DELETE FROM credit_ledger WHERE id = 'test-delete'`), 'P2034');
});

schema.test('billing allocation INSERT succeeds with real job reference', async ({ client }) => {
  await seedBillingFixture(client, 'alloc-insert-job');
  await client.query(
    `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-insert',$1,'alloc-insert-job','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-insert',now())`,
    [ids.projectA],
  );
  const result = await client.query(
    `SELECT provider_cost_micro_idr::text AS cost, job_id FROM credit_billing_allocations WHERE id = 'alloc-insert'`,
  );
  expect(result.rowCount).toBe(1);
  expect(result.rows[0]?.cost).toBe('1000');
  expect(result.rows[0]?.job_id).toBe('alloc-insert-job');
});

schema.test('billing allocation UPDATE is rejected by immutability trigger', async ({ client }) => {
  await seedBillingFixture(client, 'alloc-update-job');
  await client.query(
    `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-update',$1,'alloc-update-job','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-update',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(
      `UPDATE credit_billing_allocations SET user_settlement_micro_idr = 900 WHERE id = 'alloc-update'`,
    ),
    'P2034',
  );
});

schema.test('billing allocation DELETE is rejected by immutability trigger', async ({ client }) => {
  await seedBillingFixture(client, 'alloc-delete-job');
  await client.query(
    `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-delete',$1,'alloc-delete-job','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-delete',now())`,
    [ids.projectA],
  );
  await expectSqlState(
    client.query(`DELETE FROM credit_billing_allocations WHERE id = 'alloc-delete'`),
    'P2034',
  );
});

schema.test(
  'billing evidence survives blocked project purge via RESTRICT FKs',
  async ({ client }) => {
    await seedBillingFixture(client, 'alloc-purge-job');
    await client.query(
      `INSERT INTO credit_billing_allocations (${allocationColumns()})
     VALUES ('alloc-purge',$1,'alloc-purge-job','audit-reservation','konsep','proj-konsep-a','hash-try-1',1000,800,200,1,'{"version":"v1"}'::jsonb,'dedupe-project-concept-proj-konsep-purge',now())`,
      [ids.projectA],
    );
    // RESTRICT FK policy: project purge is refused while financial evidence exists
    await expectSqlState(
      client.query(`DELETE FROM projects WHERE id = $1`, [ids.projectA]),
      '23503',
    );
    // The evidence itself is untouched after the refused purge
    const evidence = await client.query(
      `SELECT id, provider_cost_micro_idr::text AS cost, system_subsidy_micro_idr::text AS subsidy
       FROM credit_billing_allocations WHERE id = 'alloc-purge'`,
    );
    expect(evidence.rowCount).toBe(1);
    expect(evidence.rows[0]?.cost).toBe('1000');
    expect(evidence.rows[0]?.subsidy).toBe('200');
  },
);

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
    'credit_billing_allocations_system_subsidy_conservation_check',
    'credit_billing_allocations_billing_policy_payload_object_check',
    'generation_jobs_workflow_plan_requires_bundle_check',
  ];

  expectedConstraints.forEach((name) => {
    if (!constraintNames.includes(name)) {
      throw new Error(`Missing expected constraint: ${name}`);
    }
  });
});
