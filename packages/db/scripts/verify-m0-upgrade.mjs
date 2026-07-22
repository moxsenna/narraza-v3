import assert from 'node:assert/strict';
import process from 'node:process';

const EXPECTED_ENUMS = {
  ai_tier: ['hemat', 'seimbang', 'terbaik'],
  email_token_purpose: ['verify_email', 'reset_password'],
  ui_mode: ['pemula', 'mahir'],
  user_status: ['pending_verification', 'active', 'suspended', 'deleted'],
};

const EXPECTED_INDEXES = [
  'audit_events_user_id_created_at_idx',
  'audit_events_pkey',
  'email_action_tokens_pkey',
  'email_action_tokens_token_hash_key',
  'email_action_tokens_user_id_purpose_idx',
  'rate_limit_counters_expires_at_idx',
  'rate_limit_counters_kind_key_hash_window_starts_at_key',
  'rate_limit_counters_pkey',
  'sessions_pkey',
  'sessions_session_token_key',
  'sessions_user_id_idx',
  'users_email_key',
  'users_pkey',
].sort();

export async function captureM0State(client) {
  const tables = [
    'audit_events',
    'email_action_tokens',
    'rate_limit_counters',
    'sessions',
    'users',
  ];
  const rows = {};
  for (const table of tables) {
    const result = await client.query(`SELECT * FROM "${table}" ORDER BY "id"`);
    rows[table] = result.rows;
  }
  const enums = await client.query(
    `
    SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typname = ANY($1::text[])
     ORDER BY t.typname, e.enumsortorder
  `,
    [Object.keys(EXPECTED_ENUMS)],
  );
  const indexes = await client.query(
    `
    SELECT indexname, indexdef
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = ANY($1::text[])
     ORDER BY indexname
  `,
    [tables],
  );
  return { rows, enums: enums.rows, indexes: indexes.rows };
}

export function verifyM0Baseline(state) {
  assert.deepEqual(
    Object.fromEntries(Object.entries(state.rows).map(([table, rows]) => [table, rows.length])),
    { audit_events: 1, email_action_tokens: 4, rate_limit_counters: 1, sessions: 2, users: 2 },
  );
  assert.deepEqual(
    state.rows.users.map(({ id, status, ui_mode, tier }) => ({ id, status, ui_mode, tier })),
    [
      { id: 'm0-user-active', status: 'active', ui_mode: 'mahir', tier: 'terbaik' },
      { id: 'm0-user-pending', status: 'pending_verification', ui_mode: 'pemula', tier: 'hemat' },
    ],
  );
  assert.deepEqual(
    state.rows.sessions.map(({ id, revoked_at }) => ({ id, revoked: revoked_at !== null })),
    [
      { id: 'm0-session-active', revoked: false },
      { id: 'm0-session-revoked', revoked: true },
    ],
  );
  assert.deepEqual(
    state.rows.email_action_tokens.map(({ id, purpose, consumed_at, revoked_at }) => ({
      id,
      purpose,
      consumed: consumed_at !== null,
      revoked: revoked_at !== null,
    })),
    [
      { id: 'm0-token-reset-active', purpose: 'reset_password', consumed: false, revoked: false },
      { id: 'm0-token-reset-revoked', purpose: 'reset_password', consumed: false, revoked: true },
      { id: 'm0-token-verify-active', purpose: 'verify_email', consumed: false, revoked: false },
      { id: 'm0-token-verify-consumed', purpose: 'verify_email', consumed: true, revoked: false },
    ],
  );
  assert.deepEqual(
    state.enums,
    Object.entries(EXPECTED_ENUMS)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([enum_name, values]) => values.map((enum_value) => ({ enum_name, enum_value }))),
  );
  assert.deepEqual(
    state.indexes.map(({ indexname }) => indexname),
    EXPECTED_INDEXES,
  );
}

export async function verifyM0Upgrade(client, before) {
  const after = await captureM0State(client);
  verifyM0Baseline(after);
  assert.deepEqual(after, before, 'W1.1 migration changed M0 rows, enum values, or indexes');
  process.stdout.write('PASS M0 rows, enums, and indexes preserved\n');
}
