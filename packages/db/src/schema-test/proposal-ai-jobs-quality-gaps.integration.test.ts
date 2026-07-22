import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedPlanningGraph, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();

async function seedJobInvocationsAndAttempts(
  client: Parameters<Parameters<typeof schema.test>[1]>[0]['client'],
): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('winner-job',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
    [ids.projectA],
  );
  await client.query(
    `INSERT INTO workflow_invocations
       (id,project_id,job_id,stage_key,status,fence_version,created_at,updated_at)
     VALUES ('winner-invocation-a',$1,'winner-job','draft','running',0,now(),now()),
            ('winner-invocation-b',$1,'winner-job','review','running',0,now(),now())`,
    [ids.projectA],
  );
  await client.query(
    `INSERT INTO generation_attempts
       (id,project_id,job_id,invocation_id,ordinal,status,started_at,finished_at,schema_version,payload,created_at,updated_at)
     VALUES ('winner-attempt-a',$1,'winner-job','winner-invocation-a',0,'succeeded',now(),now(),1,'{}',now(),now()),
            ('winner-attempt-b',$1,'winner-job','winner-invocation-b',0,'succeeded',now(),now(),1,'{}',now(),now())`,
    [ids.projectA],
  );
}

schema.test('workflow invocation rejects winner from another invocation in same job', async ({
  client,
}) => {
  await seedJobInvocationsAndAttempts(client);

  await expectSqlState(
    client.query(
      `UPDATE workflow_invocations
          SET status = 'succeeded', winner_attempt_id = 'winner-attempt-b', updated_at = now()
        WHERE id = 'winner-invocation-a'`,
    ),
    '23503',
  );
});

schema.test('succeeded workflow invocation requires a winner', async ({ client }) => {
  await seedJobInvocationsAndAttempts(client);

  await expectSqlState(
    client.query(
      `UPDATE workflow_invocations
          SET status = 'succeeded', updated_at = now()
        WHERE id = 'winner-invocation-a'`,
    ),
    '23514',
  );
});

schema.test('non-succeeded workflow invocation rejects a winner', async ({ client }) => {
  await seedJobInvocationsAndAttempts(client);

  await expectSqlState(
    client.query(
      `UPDATE workflow_invocations
          SET winner_attempt_id = 'winner-attempt-a', updated_at = now()
        WHERE id = 'winner-invocation-a'`,
    ),
    '23514',
  );
});

schema.test('generation job rejects workflow plan from another bundle', async ({ client }) => {
  await seedUsersAndProjects(client);
  const hashA = 'd'.repeat(64);
  const hashB = 'e'.repeat(64);
  await client.query(
    `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('job-snapshot-a',$1,'writer','writer_safe',$2,$2,1,'{}',now()),
            ('job-snapshot-b',$1,'writer','writer_safe',$3,$3,1,'{}',now())`,
    [ids.projectA, hashA, hashB],
  );
  await client.query(
    `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('job-bundle-a',$1,'job-snapshot-a',$2,$2,now() + interval '10 minutes',1,'{}',now()),
            ('job-bundle-b',$1,'job-snapshot-b',$3,$3,now() + interval '10 minutes',1,'{}',now())`,
    [ids.projectA, hashA, hashB],
  );
  await client.query(
    `INSERT INTO ai_workflow_plans
       (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
     VALUES ('job-plan-b',$1,'job-bundle-b','prose',$2,0,1,'{}',now())`,
    [ids.projectA, hashB],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,bundle_id,workflow_plan_id,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('cross-bundle-job',$1,'prose','queued',0,now(),'job-bundle-a','job-plan-b',0,1,'{}',now(),now())`,
      [ids.projectA],
    ),
    '23503',
  );
});

async function seedCandidateProseLinks(
  client: Parameters<Parameters<typeof schema.test>[1]>[0]['client'],
): Promise<void> {
  await seedPlanningGraph(client);
  const hash = 'f'.repeat(64);
  await client.query(
    `INSERT INTO proposal_groups
       (id,project_id,kind,status,dependency_hash,created_at,updated_at)
     VALUES ('prose-group-a',$1,'prose','pending',$3,now(),now()),
            ('prose-group-b',$2,'prose','pending',$3,now(),now())`,
    [ids.projectA, ids.projectB, hash],
  );
  await client.query(
    `INSERT INTO generated_candidates
       (id,project_id,group_id,ordinal,schema_version,payload,created_at)
     VALUES ('source-candidate-a',$1,'prose-group-a',0,1,'{}',now()),
            ('source-candidate-b',$1,'prose-group-a',1,1,'{}',now()),
            ('cross-project-candidate',$2,'prose-group-b',0,1,'{}',now())`,
    [ids.projectA, ids.projectB],
  );
  await client.query(
    `INSERT INTO prose_versions
       (id,project_id,beat_id,source_candidate_id,status,revision,content,content_hash,created_at)
     VALUES ('candidate-prose-a',$1,$2,'source-candidate-a','draft',0,'text',$3,now())`,
    [ids.projectA, ids.beatA, hash],
  );
}

schema.test('generated candidate accepts matching reciprocal prose pointer', async ({ client }) => {
  await seedCandidateProseLinks(client);

  await client.query(
    `UPDATE generated_candidates
        SET prose_version_id = 'candidate-prose-a'
      WHERE id = 'source-candidate-a'`,
  );
});

schema.test('generated candidate rejects prose sourced by another candidate', async ({ client }) => {
  await seedCandidateProseLinks(client);

  await expectSqlState(
    client.query(
      `UPDATE generated_candidates
          SET prose_version_id = 'candidate-prose-a'
        WHERE id = 'source-candidate-b'`,
    ),
    '23503',
  );
});

schema.test('generated candidate rejects cross-project prose pointer', async ({ client }) => {
  await seedCandidateProseLinks(client);

  await expectSqlState(
    client.query(
      `UPDATE generated_candidates
          SET prose_version_id = 'candidate-prose-a'
        WHERE id = 'cross-project-candidate'`,
    ),
    '23503',
  );
});
