/**
 * Migration runner (W0.3) — the foundation for the `migration-runner-lock`
 * invariant (S10). Wraps `prisma migrate deploy` in a Postgres session-level
 * advisory lock so two concurrent deploys can never run migrations in parallel
 * (a second runner blocks until the first releases, then finds nothing to do).
 *
 * Run via: pnpm --filter @narraza/db migrate   (tsx src/migrate.ts)
 * Reads DATABASE_URL from the environment (root .env for CLI use).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from 'pg';

// Fixed, project-specific advisory lock key. Two int4 keys → one bigint slot
// that only Narraza's migration runner uses.
const ADVISORY_LOCK_NAMESPACE = 0x6e727a; // "nrz"
const ADVISORY_LOCK_KEY = 1;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('migrate: DATABASE_URL is required');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let locked = false;
  try {
    // Blocking acquire: a parallel runner waits here instead of racing.
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      ADVISORY_LOCK_NAMESPACE,
      ADVISORY_LOCK_KEY,
    ]);
    locked = true;
    // eslint-disable-next-line no-console
    console.error('[migrate] advisory lock acquired; running prisma migrate deploy');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const result = spawnSync('prisma', ['migrate', 'deploy'], {
      cwd: path.resolve(here, '..'), // packages/db (where prisma.config.ts lives)
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });

    if (result.status !== 0) {
      throw new Error(`prisma migrate deploy failed with exit code ${result.status ?? 'null'}`);
    }
    // eslint-disable-next-line no-console
    console.error('[migrate] migrations applied');
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        ADVISORY_LOCK_NAMESPACE,
        ADVISORY_LOCK_KEY,
      ]);
    }
    await client.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', err);
  process.exit(1);
});
