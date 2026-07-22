import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();
const VALID_HASH = 'a'.repeat(64);

async function seedAcceptedProse(
  client: Parameters<Parameters<typeof schema.test>[1]>[0]['client'],
): Promise<void> {
  await seedPlanningGraph(client);
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,status,revision,content,content_hash,created_at)
     VALUES ('prose-a',$1,$2,'accepted',0,'text',$3,now())`,
    [ids.projectA, ids.beatA, VALID_HASH],
  );
}

async function seedArtifactProposal(
  client: Parameters<Parameters<typeof schema.test>[1]>[0]['client'],
): Promise<void> {
  await seedAcceptedProse(client);
  await client.query(
    `INSERT INTO artifact_proposals
       (id,project_id,prose_version_id,status,dependency_hash,schema_version,payload,created_at,updated_at)
     VALUES ('artifact-proposal-a',$1,'prose-a','accepted',$2,1,'{}',now(),now())`,
    [ids.projectA, VALID_HASH],
  );
}

schema.test(
  'credit amount CHECK rejects zero with valid references and coherence',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    await expectSqlState(
      client.query(
        `INSERT INTO credit_ledger
         (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('ledger-bad',$1,$2,'charge','debit',0,'bad',now())`,
        [ids.userA, ids.projectA],
      ),
      '23514',
    );
  },
);

schema.test('credit ledger dedupe is global', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('ledger-a',$1,$2,'charge','debit',100,'same-dedupe',now())`,
    [ids.userA, ids.projectA],
  );
  await expectSqlState(
    client.query(
      `INSERT INTO credit_ledger
         (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('ledger-b',$1,$2,'charge','debit',100,'same-dedupe',now())`,
      [ids.userB, ids.projectB],
    ),
    '23505',
  );
});

schema.test('validation report rejects cross-tenant prose reference', async ({ client }) => {
  await seedAcceptedProse(client);

  await expectSqlState(
    client.query(
      `INSERT INTO validation_reports
         (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
       VALUES ('cross-tenant-report',$1,'prose-a',$2,'v1','completed',true,1,'{}',now())`,
      [ids.projectB, VALID_HASH],
    ),
    '23503',
  );
});

schema.test('validation report hash CHECK rejects invalid hash', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO validation_reports
         (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
       VALUES ('bad-report-hash',$1,'prose-a','bad','v1','completed',true,1,'{}',now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test('validation report status CHECK rejects invalid status', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO validation_reports
         (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
       VALUES ('bad-report-status',$1,'prose-a',$2,'v1','unknown',false,1,'{}',now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('validation report payload CHECK rejects non-object JSON', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO validation_reports
         (id,project_id,prose_version_id,prose_content_hash,policy_version,status,passed,schema_version,payload,created_at)
       VALUES ('bad-report-payload',$1,'prose-a',$2,'v1','completed',true,1,'[]',now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('artifact proposal hash CHECK rejects invalid hash', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO artifact_proposals
         (id,project_id,prose_version_id,status,dependency_hash,schema_version,payload,created_at,updated_at)
       VALUES ('bad-proposal-hash',$1,'prose-a','accepted','bad',1,'{}',now(),now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test('artifact proposal status CHECK rejects invalid status', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO artifact_proposals
         (id,project_id,prose_version_id,status,dependency_hash,schema_version,payload,created_at,updated_at)
       VALUES ('bad-proposal-status',$1,'prose-a','unknown',$2,1,'{}',now(),now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('artifact proposal payload CHECK rejects non-object JSON', async ({ client }) => {
  await seedAcceptedProse(client);
  await expectSqlState(
    client.query(
      `INSERT INTO artifact_proposals
         (id,project_id,prose_version_id,status,dependency_hash,schema_version,payload,created_at,updated_at)
       VALUES ('bad-proposal-payload',$1,'prose-a','accepted',$2,1,'[]',now(),now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('publish artifact hash CHECK rejects invalid hash', async ({ client }) => {
  await seedArtifactProposal(client);
  await expectSqlState(
    client.query(
      `INSERT INTO publish_artifacts
         (id,project_id,artifact_proposal_id,prose_version_id,artifact_type,content_hash,schema_version,payload,created_at)
       VALUES ('bad-artifact-hash',$1,'artifact-proposal-a','prose-a','text','bad',1,'{}',now())`,
      [ids.projectA],
    ),
    '23514',
  );
});

schema.test('publish artifact type CHECK rejects invalid type', async ({ client }) => {
  await seedArtifactProposal(client);
  await expectSqlState(
    client.query(
      `INSERT INTO publish_artifacts
         (id,project_id,artifact_proposal_id,prose_version_id,artifact_type,content_hash,schema_version,payload,created_at)
       VALUES ('bad-artifact-type',$1,'artifact-proposal-a','prose-a','unknown',$2,1,'{}',now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('publish artifact payload CHECK rejects non-object JSON', async ({ client }) => {
  await seedArtifactProposal(client);
  await expectSqlState(
    client.query(
      `INSERT INTO publish_artifacts
         (id,project_id,artifact_proposal_id,prose_version_id,artifact_type,content_hash,schema_version,payload,created_at)
       VALUES ('bad-artifact-payload',$1,'artifact-proposal-a','prose-a','text',$2,1,'[]',now())`,
      [ids.projectA, VALID_HASH],
    ),
    '23514',
  );
});

schema.test('outbox dedupe and receipt generation unique contracts hold', async ({ client }) => {
  await client.query(
    `INSERT INTO outbox_events
       (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
     VALUES ('event-a','project','p','changed','global-event',now(),1,'{}',now())`,
  );
  await expectSqlState(
    client.query(
      `INSERT INTO outbox_events
         (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
       VALUES ('event-b','project','q','changed','global-event',now(),1,'{}',now())`,
    ),
    '23505',
  );
  await client.query(
    `INSERT INTO outbox_receipts
       (id,outbox_event_id,consumer_key,delivery_generation,status,attempt_count,created_at,updated_at)
     VALUES ('receipt-a','event-a','worker',0,'pending',0,now(),now())`,
  );
  await expectSqlState(
    client.query(
      `INSERT INTO outbox_receipts
         (id,outbox_event_id,consumer_key,delivery_generation,status,attempt_count,created_at,updated_at)
       VALUES ('receipt-b','event-a','worker',0,'pending',0,now(),now())`,
    ),
    '23505',
  );
});

schema.test('project purge removes content but retains immutable evidence', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO credit_ledger
       (id,user_id,project_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
     VALUES ('retained-ledger',$1,$2,'charge','debit',100,'retained',now())`,
    [ids.userA, ids.projectA],
  );
  await client.query(
    `INSERT INTO audit_events (id,user_id,action,entity_type,entity_id,metadata,created_at)
     VALUES ('retained-audit',$1,'project.delete','project',$2,'{}',now())`,
    [ids.userA, ids.projectA],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id,aggregate_type,aggregate_id,event_type,dedupe_key,occurred_at,schema_version,payload,created_at)
     VALUES ('retained-event','project',$1,'deleted','retained-event',now(),1,'{}',now())`,
    [ids.projectA],
  );
  await client.query(`DELETE FROM projects WHERE id=$1`, [ids.projectA]);

  for (const [table, id] of [
    ['credit_ledger', 'retained-ledger'],
    ['audit_events', 'retained-audit'],
    ['outbox_events', 'retained-event'],
  ] as const) {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${table} WHERE id=$1) AS exists`,
      [id],
    );
    if (!result.rows[0]?.exists) throw new Error(`${table} row was deleted by project purge`);
  }
});
