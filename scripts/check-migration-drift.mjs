import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(args) {
  const pnpmScript = process.env.npm_execpath;
  if (!pnpmScript) throw new Error('migration:drift requires pnpm');
  const result = spawnSync(
    process.execPath,
    [pnpmScript, '--filter', '@narraza/db', 'exec', 'prisma', ...args],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['migrate', 'status']);
run([
  'migrate',
  'diff',
  '--exit-code',
  '--from-migrations',
  '../../prisma/migrations',
  '--to-config-datasource',
]);
run([
  'migrate',
  'diff',
  '--exit-code',
  '--from-schema',
  '../../prisma/schema.prisma',
  '--to-config-datasource',
]);
