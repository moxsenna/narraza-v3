import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { expectSqlState, ids, seedUsersAndProjects } from './fixtures.js';

const schema = createSchemaTestSuite();

schema.test('workflow invocation rejects cross-tenant job reference', async ({ client }) => {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('tenant-job-a',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
    [ids.projectA],
  );

  await expectSqlState(
    client.query(
      `INSERT INTO workflow_invocations
         (id,project_id,job_id,stage_key,status,fence_version,created_at,updated_at)
       VALUES ('cross-tenant-invocation',$1,'tenant-job-a','draft','queued',0,now(),now())`,
      [ids.projectB],
    ),
    '23503',
  );
});

schema.test(
  'job lifecycle, fence, payload, and workflow stage contracts hold',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('bad-job',$1,'prose','unknown',0,now(),0,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('bad-fence',$1,'prose','queued',0,now(),-1,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('bad-payload',$1,'prose','queued',0,now(),0,1,'[]',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('bad-schema-version',$1,'prose','queued',0,now(),0,0,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await client.query(
      `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('job-a',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );
    await client.query(
      `INSERT INTO workflow_invocations
       (id,project_id,job_id,stage_key,status,fence_version,created_at,updated_at)
     VALUES ('invocation-a',$1,'job-a','draft','queued',0,now(),now())`,
      [ids.projectA],
    );
    await expectSqlState(
      client.query(
        `INSERT INTO workflow_invocations
         (id,project_id,job_id,stage_key,status,fence_version,created_at,updated_at)
       VALUES ('invocation-b',$1,'job-a','draft','queued',0,now(),now())`,
        [ids.projectA],
      ),
      '23505',
    );
  },
);

schema.test('belief fold and job claim indexes match exact definitions', async ({ client }) => {
  const result = await client.query<{ index_name: string; index_definition: string }>(
    `SELECT index_class.relname AS index_name,
            regexp_replace(
              replace(pg_get_indexdef(index_class.oid), '"', ''),
              '\\s+',
              ' ',
              'g'
            ) AS index_definition
       FROM pg_class AS index_class
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
      WHERE index_namespace.nspname = 'public'
        AND index_class.relname = ANY($1::text[])
      ORDER BY index_class.relname`,
    [
      [
        'character_beliefs_fold_idx',
        'generation_jobs_expired_running_lease_idx',
        'generation_jobs_queued_claim_idx',
      ],
    ],
  );

  expect(result.rows).toEqual([
    {
      index_name: 'character_beliefs_fold_idx',
      index_definition:
        'CREATE INDEX character_beliefs_fold_idx ON public.character_beliefs USING btree (project_id, character_id, belief_key, effective_sequence DESC, created_at DESC, id DESC)',
    },
    {
      index_name: 'generation_jobs_expired_running_lease_idx',
      index_definition:
        "CREATE INDEX generation_jobs_expired_running_lease_idx ON public.generation_jobs USING btree (lease_expires_at, id) WHERE (status = 'running'::text)",
    },
    {
      index_name: 'generation_jobs_queued_claim_idx',
      index_definition:
        "CREATE INDEX generation_jobs_queued_claim_idx ON public.generation_jobs USING btree (available_at, priority DESC, created_at, id) WHERE (status = 'queued'::text)",
    },
  ]);
});
