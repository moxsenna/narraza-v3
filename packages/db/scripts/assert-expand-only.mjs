import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageDirectory, '../..');

export const W11_MIGRATIONS = [
  { id: '20260722090000_planning_expand', prerequisite: '20260721181246_init_m0_auth' },
  { id: '20260722091000_knowledge_prose_expand', prerequisite: '20260722090000_planning_expand' },
  {
    id: '20260722092000_proposal_ai_jobs_expand',
    prerequisite: '20260722091000_knowledge_prose_expand',
  },
  {
    id: '20260722093000_credit_validation_publish_ops_expand',
    prerequisite: '20260722092000_proposal_ai_jobs_expand',
  },
];

const REQUIRED_METADATA = [
  'Migration ID',
  'UTC date',
  'Workstream',
  'Purpose',
  'Classification',
  'Prerequisite',
  'Lock profile',
  'Backfill',
  'Verification',
  'Rollback posture',
];

function metadata(sql) {
  const entries = new Map();
  for (const match of sql.matchAll(/^-- ([^:\r\n]+):\s*(.+)$/gm))
    entries.set(match[1], match[2].trim());
  return entries;
}

function executableSql(sql) {
  let executable = '';
  let index = 0;

  const skipQuoted = (quote) => {
    index += 1;
    while (index < sql.length) {
      if (sql[index] !== quote) {
        index += 1;
        continue;
      }
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }
      index += 1;
      return;
    }
  };

  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index + 2);
      index = newline === -1 ? sql.length : newline;
      executable += ' ';
      continue;
    }
    if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      executable += ' ';
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      skipQuoted(sql[index]);
      executable += ' ';
      continue;
    }
    if (sql[index] === '$') {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/)?.[0];
      if (delimiter) {
        const bodyStart = index + delimiter.length;
        const bodyEnd = sql.indexOf(delimiter, bodyStart);
        if (bodyEnd === -1) {
          executable += sql[index];
          index += 1;
          continue;
        }
        const functionBody =
          /\b(?:CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|PROCEDURE)|DO)\b[\s\S]*\bAS\s*$/i.test(
            executable,
          );
        if (functionBody) executable += ` ${executableSql(sql.slice(bodyStart, bodyEnd))} `;
        else executable += ' ';
        index = bodyEnd + delimiter.length;
        continue;
      }
    }
    executable += sql[index];
    index += 1;
  }

  return executable;
}

export function assertExpandOnlySql(sql, migration) {
  const headers = metadata(sql);
  for (const key of REQUIRED_METADATA)
    assert(headers.has(key), `${migration.id}: missing metadata ${key}`);
  assert.equal(headers.get('Migration ID'), migration.id, `${migration.id}: wrong Migration ID`);
  assert.match(headers.get('UTC date'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/);
  assert.equal(headers.get('Workstream'), 'W1.1');
  assert.equal(headers.get('Classification'), 'expand-only');
  assert.equal(headers.get('Prerequisite'), migration.prerequisite);
  assert.match(headers.get('Lock profile'), /\S/);
  assert.match(headers.get('Backfill'), /\S/);
  assert.match(headers.get('Verification'), /\S/);
  assert.equal(headers.get('Rollback posture'), 'forward-fix');

  const body = executableSql(sql);
  const destructivePatterns = [
    ['DROP', /\bDROP\b/i],
    ['RENAME', /\bRENAME\b/i],
    [
      'ALTER COLUMN TYPE',
      /\bALTER\s+TABLE\s+\S+\s+ALTER\s+(?:COLUMN\s+)?\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i,
    ],
  ];
  for (const [name, pattern] of destructivePatterns) {
    assert(!pattern.test(body), `${migration.id}: destructive ${name} statement found`);
  }
}

export async function assertExpandOnlyMigrations() {
  for (const migration of W11_MIGRATIONS) {
    const file = path.join(repoRoot, 'prisma', 'migrations', migration.id, 'migration.sql');
    assertExpandOnlySql(await readFile(file, 'utf8'), migration);
  }
  process.stdout.write('PASS 4 W1.1 migrations are ordered, metadata-complete, and expand-only\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assertExpandOnlyMigrations();
}
