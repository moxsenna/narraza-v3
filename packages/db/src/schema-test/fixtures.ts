import type { Pool } from 'pg';

export const APPLICATION_TABLES = [
  'ai_usage_events',
  'ai_workflow_plans',
  'arcs',
  'artifact_proposals',
  'audit_events',
  'beats',
  'canonical_change_operations',
  'canonical_change_sets',
  'chapters',
  'character_beliefs',
  'character_states',
  'characters',
  'concept_sets',
  'concepts',
  'context_snapshots',
  'credit_ledger',
  'credit_quotes',
  'credit_reservations',
  'email_action_tokens',
  'fact_disclosures',
  'facts',
  'foundations',
  'generated_candidates',
  'generation_attempts',
  'generation_context_bundles',
  'generation_jobs',
  'intake_messages',
  'intake_sessions',
  'model_price_snapshots',
  'outbox_events',
  'outbox_receipts',
  'projects',
  'proposal_groups',
  'proposals',
  'prose_evidence',
  'prose_versions',
  'prose_working_drafts',
  'publish_artifacts',
  'rate_limit_counters',
  'reader_fact_states',
  'reveal_breadcrumbs',
  'reveals',
  'roadmaps',
  'sessions',
  'users',
  'validation_findings',
  'validation_reports',
  'workflow_invocations',
] as const;

export const M0_ENUMS = {
  ai_tier: ['hemat', 'seimbang', 'terbaik'],
  email_token_purpose: ['verify_email', 'reset_password'],
  ui_mode: ['pemula', 'mahir'],
  user_status: ['pending_verification', 'active', 'suspended', 'deleted'],
} as const;

export const ids = {
  userA: '00000000-0000-4000-8000-000000000001',
  userB: '00000000-0000-4000-8000-000000000002',
  projectA: '10000000-0000-4000-8000-000000000001',
  projectB: '10000000-0000-4000-8000-000000000002',
  roadmapA: '20000000-0000-4000-8000-000000000001',
  arcA: '30000000-0000-4000-8000-000000000001',
  chapterA: '40000000-0000-4000-8000-000000000001',
  chapterB: '40000000-0000-4000-8000-000000000002',
  chapterC: '40000000-0000-4000-8000-000000000003',
  beatA: '50000000-0000-4000-8000-000000000001',
  beatB: '50000000-0000-4000-8000-000000000002',
  beatC: '50000000-0000-4000-8000-000000000003',
} as const;

export async function cleanDatabase(client: Pool): Promise<void> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`,
  );
  if (result.rows.length === 0) return;
  const names = result.rows
    .map(({ table_name }) => `"${table_name.replaceAll('"', '""')}"`)
    .join(', ');
  await client.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export async function seedUsersAndProjects(client: Pool): Promise<void> {
  await client.query(
    `INSERT INTO users (id,email,password_hash,status,created_at,updated_at) VALUES
       ($1,'owner-a@narraza.test','hashed:x','active',now(),now()),
       ($2,'owner-b@narraza.test','hashed:x','active',now(),now())`,
    [ids.userA, ids.userB],
  );
  await client.query(
    `INSERT INTO projects
       (id,owner_user_id,title,intake_path,status,current_canonical_version,revision,created_at,updated_at)
     VALUES ($1,$2,'Project A','guided','active',0,0,now(),now()),
            ($3,$4,'Project B','guided','active',0,0,now(),now())`,
    [ids.projectA, ids.userA, ids.projectB, ids.userB],
  );
}

export async function seedPlanningGraph(client: Pool): Promise<void> {
  await seedUsersAndProjects(client);
  await client.query(
    `INSERT INTO roadmaps (id,project_id,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,'Roadmap',0,1,'{}',now(),now())`,
    [ids.roadmapA, ids.projectA],
  );
  await client.query(
    `INSERT INTO arcs (id,project_id,roadmap_id,ordinal,title,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'Arc',0,1,'{}',now(),now())`,
    [ids.arcA, ids.projectA, ids.roadmapA],
  );
  await client.query(
    `INSERT INTO chapters
       (id,project_id,arc_id,ordinal,title,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,'A',0,0,1,'{}',now(),now()),
            ($4,$2,$3,1,'B',1,0,1,'{}',now(),now())`,
    [ids.chapterA, ids.projectA, ids.arcA, ids.chapterB],
  );
  await client.query(
    `INSERT INTO beats
       (id,project_id,chapter_id,ordinal,narrative_sequence,revision,schema_version,payload,created_at,updated_at)
     VALUES ($1,$2,$3,0,0,0,1,'{}',now(),now()),
            ($4,$2,$5,0,1,0,1,'{}',now(),now())`,
    [ids.beatA, ids.projectA, ids.chapterA, ids.beatB, ids.chapterB],
  );
}

export async function expectSqlState(operation: Promise<unknown>, sqlState: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if ((error as { code?: string }).code === sqlState) return;
      throw new Error(
        `Expected SQLSTATE ${sqlState}, received ${(error as { code?: string }).code}`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
  throw new Error(`Expected SQLSTATE ${sqlState}, but statement succeeded`);
}
