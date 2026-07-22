import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

type Client = Parameters<Parameters<typeof schema.test>[1]>[0]['client'];

async function seedJobs(client: Client): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('audit-job-a',$1,'prose','queued',0,now(),0,1,'{}',now(),now()),
            ('audit-job-a2',$1,'prose','queued',0,now(),0,1,'{}',now(),now()),
            ('audit-job-b',$2,'prose','queued',0,now(),0,1,'{}',now(),now())`,
    [ids.projectA, ids.projectB],
  );
}

async function seedBoundReservation(client: Client): Promise<void> {
  await seedJobs(client);
  await client.query(
    `INSERT INTO credit_reservations
       (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
     VALUES ('audit-reservation',$1,$2,'audit-job-a','open',100,0,0,100,now(),now())`,
    [ids.userA, ids.projectA],
  );
  await client.query(
    `UPDATE generation_jobs SET reservation_id='audit-reservation', updated_at=now()
     WHERE id='audit-job-a'`,
  );
}

async function seedPlanAndQuote(client: Client): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('audit-snapshot',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('audit-bundle',$1,'audit-snapshot',$2,$2,now() + interval '1 hour',1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ('audit-plan',$1,'audit-bundle','prose',$2,1000,1,'{}',now())`,
    [ids.projectA, HASH_A],
  );
  await client.query(
    `INSERT INTO credit_quotes
       (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,created_at)
     VALUES ('audit-quote',$1,$2,'audit-plan',$3,$3,1000,now() + interval '10 minutes',now())`,
    [ids.userA, ids.projectA, HASH_A],
  );
}

schema.test('reservation insert rejects project A bound to job B', async ({ client }) => {
  await seedJobs(client);
  await expectSqlState(
    client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,created_at,updated_at)
       VALUES ('cross-project-reservation',$1,$2,'audit-job-b','open',100,0,0,100,now(),now())`,
      [ids.userA, ids.projectA],
    ),
    '23503',
  );
});

schema.test('valid reservation cannot drift via project mutation', async ({ client }) => {
  await seedBoundReservation(client);
  await expectSqlState(
    client.query(
      `UPDATE credit_reservations SET project_id=$1, updated_at=now()
       WHERE id='audit-reservation'`,
      [ids.projectB],
    ),
    '23503',
  );
});

schema.test('valid reservation cannot drift via job mutation', async ({ client }) => {
  await seedBoundReservation(client);
  await expectSqlState(
    client.query(
      `UPDATE credit_reservations SET job_id='audit-job-b', updated_at=now()
       WHERE id='audit-reservation'`,
    ),
    '23503',
  );
});

schema.test('reciprocal job pointer blocks reservation job mutation', async ({ client }) => {
  await seedBoundReservation(client);
  await expectSqlState(
    client.query(
      `UPDATE credit_reservations SET job_id='audit-job-a2', updated_at=now()
       WHERE id='audit-reservation'`,
    ),
    '23503',
  );
});

schema.test(
  'bound reservation blocks reciprocal parent job project mutation',
  async ({ client }) => {
    await seedBoundReservation(client);
    await expectSqlState(
      client.query(
        `UPDATE generation_jobs SET project_id=$1, updated_at=now()
       WHERE id='audit-job-a'`,
        [ids.projectB],
      ),
      '23503',
    );
  },
);

schema.test(
  'referenced workflow plan hash cannot drift from retained quote evidence',
  async ({ client }) => {
    await seedPlanAndQuote(client);
    await expectSqlState(
      client.query(`UPDATE ai_workflow_plans SET plan_hash=$1 WHERE id='audit-plan'`, [HASH_B]),
      '23503',
    );
  },
);
