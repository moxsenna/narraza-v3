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

schema.test(
  'proposal lifecycle, hashes, payloads, and tenant parents are constrained',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    const hash = 'a'.repeat(64);
    await client.query(
      `INSERT INTO canonical_change_sets
       (id,project_id,origin,status,base_canonical_version,operations_hash,created_at,updated_at)
     VALUES ('change-a',$1,'ai','pending',0,$2,now(),now())`,
      [ids.projectA, hash],
    );
    await client.query(
      `INSERT INTO proposal_groups
       (id,project_id,kind,status,dependency_hash,created_at,updated_at)
     VALUES ('group-a',$1,'prose','pending',$2,now(),now())`,
      [ids.projectA, hash],
    );

    await expectSqlState(
      client.query(
        `INSERT INTO proposals
         (id,project_id,group_id,change_set_id,source,status,operations_hash,dependency_hash,created_at,updated_at)
       VALUES ('proposal-cross',$1,'group-a','change-a','ai','pending',$2,$2,now(),now())`,
        [ids.projectB, hash],
      ),
      '23503',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO proposals
         (id,project_id,group_id,change_set_id,source,status,operations_hash,dependency_hash,created_at,updated_at)
       VALUES ('proposal-status',$1,'group-a','change-a','ai','draft',$2,$2,now(),now())`,
        [ids.projectA, hash],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO canonical_change_operations
         (id,project_id,change_set_id,ordinal,operation_type,target_entity_type,target_entity_id,expected_revision,risk,schema_version,payload,created_at)
       VALUES ('bad-operation',$1,'change-a',0,'fact.upsert','fact','fact-a',-1,'low',1,'[]',now())`,
        [ids.projectA],
      ),
      '23514',
    );
  },
);

schema.test(
  'job lease coherence and deferred cross-entity pointers prevent mismatches',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,lease_token,lease_expires_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('queued-with-lease',$1,'prose','queued',0,now(),'lease',now() + interval '1 minute',0,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
       VALUES ('running-without-lease',$1,'prose','running',0,now(),0,1,'{}',now(),now())`,
        [ids.projectA],
      ),
      '23514',
    );

    await client.query(
      `INSERT INTO generation_jobs
       (id,project_id,kind,status,priority,available_at,fence_version,schema_version,payload,created_at,updated_at)
     VALUES ('job-pointer-a',$1,'prose','queued',0,now(),0,1,'{}',now(),now())`,
      [ids.projectA],
    );
    await expectSqlState(
      client.query(
        `INSERT INTO proposal_groups
         (id,project_id,kind,status,dependency_hash,source_job_id,created_at,updated_at)
       VALUES ('group-cross-job',$1,'prose','pending',$2,'job-pointer-a',now(),now())`,
        [ids.projectB, 'b'.repeat(64)],
      ),
      '23503',
    );
  },
);

schema.test(
  'snapshot, workflow plan, attempt, and usage numeric/hash contracts hold',
  async ({ client }) => {
    await seedUsersAndProjects(client);
    const hash = 'c'.repeat(64);
    await client.query(
      `INSERT INTO context_snapshots
       (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
     VALUES ('snapshot-a',$1,'writer','writer_safe',$2,$2,1,'{}',now())`,
      [ids.projectA, hash],
    );
    await client.query(
      `INSERT INTO generation_context_bundles
       (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
     VALUES ('bundle-a',$1,'snapshot-a',$2,$2,now() + interval '10 minutes',1,'{}',now())`,
      [ids.projectA, hash],
    );
    await expectSqlState(
      client.query(
        `INSERT INTO ai_workflow_plans
         (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
       VALUES ('plan-negative',$1,'bundle-a','prose',$2,-1,1,'{}',now())`,
        [ids.projectA, hash],
      ),
      '23514',
    );
    await expectSqlState(
      client.query(
        `INSERT INTO model_price_snapshots
         (id,provider_id,requested_model_id,resolved_model_id,input_rate_micro_idr,output_rate_micro_idr,currency,effective_at,schema_version,payload,created_at)
       VALUES ('price-negative','provider','requested','resolved',-1,0,'IDR',now(),1,'{}',now())`,
      ),
      '23514',
    );
  },
);
