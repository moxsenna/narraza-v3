import { expect } from 'vitest';
import { createSchemaTestSuite } from './harness.js';
import { APPLICATION_TABLES, M0_ENUMS } from './fixtures.js';

const schema = createSchemaTestSuite();

schema.test('contains exactly 48 application tables', async ({ client }) => {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );

  expect(result.rows.map((row) => row.table_name)).toEqual([...APPLICATION_TABLES].sort());
});

schema.test('preserves M0 columns and enum values', async ({ client }) => {
  const columns = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [['users', 'sessions', 'email_action_tokens', 'rate_limit_counters', 'audit_events']],
  );

  expect(columns.rows).toEqual([
    ...['id', 'user_id', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at'].map(
      (column_name) => ({ table_name: 'audit_events', column_name }),
    ),
    ...[
      'id',
      'user_id',
      'purpose',
      'token_hash',
      'expires_at',
      'consumed_at',
      'revoked_at',
      'created_at',
    ].map((column_name) => ({ table_name: 'email_action_tokens', column_name })),
    ...['id', 'kind', 'key_hash', 'window_starts_at', 'count', 'expires_at', 'updated_at'].map(
      (column_name) => ({ table_name: 'rate_limit_counters', column_name }),
    ),
    ...[
      'id',
      'session_token',
      'user_id',
      'expires_at',
      'absolute_expires_at',
      'last_active_at',
      'revoked_at',
      'created_at',
    ].map((column_name) => ({ table_name: 'sessions', column_name })),
    ...[
      'id',
      'email',
      'password_hash',
      'status',
      'email_verified_at',
      'ui_mode',
      'tier',
      'created_at',
      'updated_at',
    ].map((column_name) => ({ table_name: 'users', column_name })),
  ]);

  const enums = await client.query<{ enum_name: string; enum_value: string }>(
    `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = ANY($1::text[])
      ORDER BY t.typname, e.enumsortorder`,
    [Object.keys(M0_ENUMS)],
  );

  expect(enums.rows).toEqual(
    Object.entries(M0_ENUMS)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([enum_name, values]) => values.map((enum_value) => ({ enum_name, enum_value }))),
  );
});
