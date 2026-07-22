import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageDirectory = path.resolve(import.meta.dirname, '../packages/db');
const prismaCli = require.resolve('prisma/build/index.js', {
  paths: [packageDirectory],
});

function run(args, captureOutput = false) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: packageDirectory,
    encoding: captureOutput ? 'utf8' : undefined,
    stdio: captureOutput ? 'pipe' : 'inherit',
    env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (captureOutput) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`Prisma exited with status ${result.status ?? 1}`);
  }
  return result;
}

export function assertEmptySqlDiff(label, sql) {
  const executableSql = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--\s*This is an empty migration\.\s*$/.test(line))
    .join('\n')
    .trim();
  if (executableSql)
    throw new Error(`${label} drift detected; expected empty SQL output:\n${executableSql}`);
}

export function checkMigrationDrift(execute = run) {
  execute(['migrate', 'status']);
  const migrationDiff = execute(
    [
      'migrate',
      'diff',
      '--script',
      '--from-migrations',
      '../../prisma/migrations',
      '--to-config-datasource',
    ],
    true,
  );
  assertEmptySqlDiff('migration-to-DB', migrationDiff.stdout ?? '');

  const schemaDiff = execute(
    [
      'migrate',
      'diff',
      '--script',
      '--from-schema',
      '../../prisma/schema.prisma',
      '--to-config-datasource',
    ],
    true,
  );
  assertEmptySqlDiff('schema-to-DB', schemaDiff.stdout ?? '');

  process.stdout.write('PASS migration-to-DB and schema-to-DB SQL output explicitly empty\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMigrationDrift();
}
