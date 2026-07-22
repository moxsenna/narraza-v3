import process from 'node:process';

const EXPECTED_TABLES = [
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
].sort();

export async function verifySchemaInventory(client) {
  const result = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND table_name <> '_prisma_migrations'
     ORDER BY table_name
  `);
  const actual = result.rows.map(({ table_name }) => table_name);
  const missing = EXPECTED_TABLES.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !EXPECTED_TABLES.includes(name));
  if (missing.length || extra.length || actual.length !== EXPECTED_TABLES.length) {
    throw new Error(
      `Schema inventory mismatch. missing=[${missing.join(', ')}] extra=[${extra.join(', ')}] expected=48 actual=${actual.length}`,
    );
  }
  process.stdout.write('PASS 48 tables = 5 M0 + 43 W1.1\n');
}

export { EXPECTED_TABLES };
