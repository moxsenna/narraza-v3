import { describe, expect, it } from 'vitest';
import { assertExpandOnlySql, W11_MIGRATIONS } from './assert-expand-only.mjs';

const migration = W11_MIGRATIONS[0];
const metadata = `
-- Migration ID: ${migration.id}
-- UTC date: 2026-07-22 09:00:00Z
-- Workstream: W1.1
-- Purpose: scanner test
-- Classification: expand-only
-- Prerequisite: ${migration.prerequisite}
-- Lock profile: additive DDL
-- Backfill: none
-- Verification: unit test
-- Rollback posture: forward-fix
`;

function accepts(body) {
  expect(() => assertExpandOnlySql(`${metadata}\n${body}`, migration)).not.toThrow();
}

function rejects(body, destructive) {
  expect(() => assertExpandOnlySql(`${metadata}\n${body}`, migration)).toThrow(
    `destructive ${destructive} statement found`,
  );
}

describe('assertExpandOnlySql lexical scanning', () => {
  it('rejects destructive SQL hidden after a string containing a line-comment marker', () => {
    rejects(`SELECT '-- harmless'; DROP TABLE users;`, 'DROP');
  });

  it('ignores destructive words in metadata comments and SQL comments', () => {
    accepts(`
-- DROP TABLE users;
/* RENAME and ALTER TABLE users ALTER COLUMN email TYPE text */
CREATE TABLE safe_table (id text);
`);
  });

  it('ignores destructive words in strings and quoted identifiers', () => {
    accepts(`SELECT 'DROP TABLE users', "RENAME", 'ALTER COLUMN email TYPE text';`);
  });

  it('handles escaped quotes without exposing string contents as SQL', () => {
    accepts(`SELECT 'it''s a DROP TABLE users example';`);
  });

  it('ignores destructive words inside non-executed dollar-quoted values', () => {
    accepts(`SELECT $message$DROP TABLE users; RENAME x; $message$;`);
  });

  it('conservatively rejects destructive SQL in a dollar-quoted function body', () => {
    rejects(
      `CREATE FUNCTION unsafe() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DROP TABLE users; END $$;`,
      'DROP',
    );
  });
});
