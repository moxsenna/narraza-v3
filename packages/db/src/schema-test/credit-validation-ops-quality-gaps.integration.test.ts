import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

type Client = Parameters<Parameters<typeof schema.test>[1]>[0]['client'];

async function seedProse(client: Client): Promise<void> {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ('prose-a',$1,$2,'validated',0,'A',$4,now()),
            ('prose-b',$1,$3,'validated',0,'B',$5,now())`,
    [ids.projectA, ids.beatA, ids.beatB, HASH_A, HASH_B],
  );
}

async function seedWorkflowPlan(client: Client): Promise<void> {
  await seedUsersAndProjects(client);
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

schema.test('ledger rejects entry type and direction mismatch', async ({ client }) => {
  await seedUsersAndProjects(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_ledger
         (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('ledger-direction',$1,$2,'charge','credit',100,'ledger-direction',now())`,
      [ids.userA, ids.projectA],
    ),
    '23514',
  );
});

schema.test('reservation enforces amount and closing lifecycle coherence', async ({ client }) => {
  await seedUsersAndProjects(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('bad-reservation',$1,$2,'settled',100,90,0,10,now(),now())`,
      [ids.userA, ids.projectA],
    ),
    '23514',
  );
});

schema.test(
  'job reservation pointer rejects reservation bound to another job',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    await client.query(
      `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('reservation-job-a',$1,'prose','queued',0,now(),0,1,'{}',now(),now()),
            ('reservation-job-b',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );
    await client.query(
      `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
     VALUES ('reservation-a',$1,$2,'reservation-job-a','open',100,0,0,100,now(),now())`,
      [ids.userA, ids.projectA],
    );
    await expectSqlState(
      client.query(
        `UPDATE generation_jobs SET reservation_id='reservation-a', updated_at=now()
        WHERE id='reservation-job-b'`,
      ),
      '23503',
    );
  },
);

schema.test('quote rejects workflow plan hash mismatch', async ({ client }) => {
  await seedWorkflowPlan(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_quotes
         (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,created_at)
       VALUES ('bad-quote',$1,$2,'quote-plan',$3,$4,1000,now() + interval '10 minutes',now())`,
      [ids.userA, ids.projectA, HASH_B, HASH_A],
    ),
    '23503',
  );
});

schema.test('validation report hash must match referenced prose', async ({ client }) => {
  await seedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO validation_reports
         (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
       VALUES ('report-hash-mismatch',$1,'prose-a',$2,'v1','completed',true,1,'{}',now())`,
      [ids.projectA, HASH_B],
    ),
    '23503',
  );
});

schema.test(
  'validation finding evidence must match report prose and tenant',
  async ({ client }) => {
    await seedProse(client);
    await client.query(
      `INSERT INTO validation_reports
       (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
     VALUES ('report-a',$1,'prose-a',$2,'v1','completed',true,1,'{}',now())`,
      [ids.projectA, HASH_A],
    );
    await client.query(
      `INSERT INTO prose_evidence
       (id,project_id,prose_version_id,start_utf16,end_utf16,content_hash,evidence_type,schema_version,payload,created_at)
     VALUES ('evidence-b',$1,'prose-b',0,1,$2,'validation',1,'{}',now())`,
      [ids.projectA, HASH_B],
    );
    await expectSqlState(
      client.query(
        `INSERT INTO validation_findings
         (id,project_id,report_id,prose_version_id,source,severity,rule_key,message,evidence_id,schema_version,payload,created_at)
       VALUES ('finding-mismatch',$1,'report-a','prose-a','validator','error','rule','message','evidence-b',1,'{}',now())`,
        [ids.projectA],
      ),
      '23503',
    );
  },
);

schema.test('publish artifact prose must match artifact proposal source', async ({ client }) => {
  await seedProse(client);
  await client.query(
    `INSERT INTO artifact_proposals
       (id,project_id,prose_version_id,status,dependency_hash,schema_version,payload,created_at,updated_at)
     VALUES ('publish-proposal',$1,'prose-a','accepted',$2,1,'{}',now(),now())`,
    [ids.projectA, HASH_A],
  );
  await expectSqlState(
    client.query(
      `INSERT INTO publish_artifacts
         (id,project_id,artifact_proposal_id,prose_version_id,artifact_type,content_hash,schema_version,payload,created_at)
       VALUES ('publish-mismatch',$1,'publish-proposal','prose-b','text',$2,1,'{}',now())`,
      [ids.projectA, HASH_B],
    ),
    '23503',
  );
});

schema.test('settled reservation supports partial settlement plus release', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,created_at,updated_at)
     VALUES ('partial-settle',$1,$2,'settled',100,60,40,0,now(),now(),now())`,
    [ids.userA, ids.projectA],
  );
  await expectSqlState(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,created_at,updated_at)
       VALUES ('settled-exposure',$1,$2,'settled',100,60,30,10,now(),now(),now())`,
      [ids.userA, ids.projectA],
    ),
    '23514',
  );
});

schema.test('project purge retains linked reservation and quote evidence', async ({ client }) => {
  await seedWorkflowPlan(client);
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,bundle_id,workflow_plan_id,schema_version,payload,created_at,updated_at)
     VALUES ('purge-job',$1,'prose','queued',0,now(),0,'quote-bundle','quote-plan',1,'{}',now(),now())`,
    [ids.projectA],
  );
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
     VALUES ('purge-reservation',$1,$2,'purge-job','open',100,0,0,100,now(),now())`,
    [ids.userA, ids.projectA],
  );
  await client.query(
    `UPDATE generation_jobs SET reservation_id='purge-reservation' WHERE id='purge-job'`,
  );
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,created_at)
     VALUES ('purge-quote',$1,$2,'quote-plan',$3,$3,1000,now() + interval '10 minutes',now())`,
    [ids.userA, ids.projectA, HASH_A],
  );

  await client.query(`DELETE FROM projects WHERE id=$1`, [ids.projectA]);

  const reservation = await client.query<{ project_id: string | null; job_id: string | null }>(
    `SELECT project_id,job_id FROM credit_reservations WHERE id='purge-reservation'`,
  );
  expect(reservation.rows).toEqual([{ project_id: ids.projectA, job_id: null }]);
  const quote = await client.query<{ project_id: string | null; workflow_plan_id: string | null }>(
    `SELECT project_id,workflow_plan_id FROM credit_quotes WHERE id='purge-quote'`,
  );
  expect(quote.rows).toEqual([{ project_id: ids.projectA, workflow_plan_id: null }]);
  for (const table of ['generation_jobs', 'ai_workflow_plans', 'projects'] as const) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table} WHERE id = ANY($1::text[])`,
      [['purge-job', 'quote-plan', ids.projectA]],
    );
    expect(result.rows[0]?.count).toBe('0');
  }
});

schema.test(
  'outbox receipt supports exact locked statuses and lifecycle timestamps',
  async ({ client }) => {
    await client.query(
      `INSERT INTO outbox_events
       (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
     VALUES ('receipt-event','project','p','changed','receipt-event',now(),1,'{}',now())`,
    );
    await client.query(
      `INSERT INTO outbox_receipts
       (id,outbox_event_id,consumer_key,delivery_generation,status,attempt_count,processing_started_at,lease_expires_at,completed_at,uncertain_at,dead_at,last_error_code,created_at,updated_at)
     VALUES ('processing-receipt','receipt-event','worker',0,'processing',1,now(),now() + interval '1 minute',NULL,NULL,NULL,NULL,now(),now()),
            ('completed-receipt','receipt-event','worker',1,'completed',1,now(),NULL,now(),NULL,NULL,NULL,now(),now()),
            ('uncertain-receipt','receipt-event','worker',2,'uncertain',1,now(),NULL,NULL,now(),NULL,'SIDE_EFFECT_UNKNOWN',now(),now()),
            ('dead-receipt','receipt-event','worker',3,'dead',3,now(),NULL,NULL,NULL,now(),'MAX_ATTEMPTS',now(),now())`,
    );

    for (const [generation, status] of ['pending', 'leased', 'retry', 'delivered'].entries()) {
      await expectSqlState(
        client.query(
          `INSERT INTO outbox_receipts
           (id,outbox_event_id,consumer_key,delivery_generation,status,attempt_count,created_at,updated_at)
         VALUES ($1,'receipt-event','legacy',$2,$3,0,now(),now())`,
          [`legacy-${status}`, generation, status],
        ),
        '23514',
      );
    }
    await expectSqlState(
      client.query(
        `INSERT INTO outbox_receipts
         (id,outbox_event_id,consumer_key,delivery_generation,status,attempt_count,processing_started_at,created_at,updated_at)
       VALUES ('bad-uncertain','receipt-event','worker',4,'uncertain',1,now(),now(),now())`,
      ),
      '23514',
    );
  },
);
