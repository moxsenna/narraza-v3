import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { assertExpandOnlyMigrations, W11_MIGRATIONS } from './assert-expand-only.mjs';
import { captureM0State, verifyM0Baseline, verifyM0Upgrade } from './verify-m0-upgrade.mjs';
import { verifySchemaInventory } from './verify-schema-inventory.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');
const { Client } = pg;
const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageDirectory, '../..');
const prismaRoot = path.join(repoRoot, 'prisma');
const M0_MIGRATION = '20260721181246_init_m0_auth';
const ALL_MIGRATIONS = [M0_MIGRATION, ...W11_MIGRATIONS.map(({ id }) => id)];
const MODES = new Set(['empty', 'upgrade', 'all']);

async function sqlFile(...segments) {
  return readFile(path.join(repoRoot, ...segments), 'utf8');
}

export async function runWithCleanup(operation, cleanup) {
  let result;
  let primaryError;
  try {
    result = await operation();
  } catch (error) {
    primaryError = error;
  }

  let cleanupError;
  try {
    await cleanup();
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError && cleanupError) {
    throw new AggregateError([primaryError, cleanupError], 'Operation and cleanup both failed');
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function cleanupResources(client, container, temporaryDirectory) {
  const results = await Promise.allSettled([
    client?.end(),
    container?.stop(),
    temporaryDirectory ? rm(temporaryDirectory, { recursive: true, force: true }) : undefined,
  ]);
  const errors = results
    .filter(({ status }) => status === 'rejected')
    .map(({ reason }) => reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Multiple cleanup operations failed');
}

export async function deployWithPrisma({ databaseUrl, configPath, execute = executePrisma }) {
  await execute(['exec', 'prisma', 'migrate', 'deploy', '--config', configPath], {
    cwd: packageDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function executePrisma(args, options) {
  const prismaArgs = args.slice(2);
  try {
    await execFileAsync(process.execPath, [prismaCli, ...prismaArgs], {
      ...options,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      [error.message, error.stdout?.trim(), error.stderr?.trim()].filter(Boolean).join('\n'),
      { cause: error },
    );
  }
}

export async function stageMigrationHistory({
  temporaryDirectory,
  migrationIds,
  copy = cp,
  writeFile: write = writeFile,
  mkdir: makeDirectory = mkdir,
}) {
  const stagedPrismaRoot = path.join(temporaryDirectory, 'prisma');
  const migrationsDirectory = path.join(stagedPrismaRoot, 'migrations');
  const configPath = path.join(temporaryDirectory, 'prisma.config.ts');
  await makeDirectory(migrationsDirectory, { recursive: true });
  await copy(path.join(prismaRoot, 'schema.prisma'), path.join(stagedPrismaRoot, 'schema.prisma'));
  await copy(
    path.join(prismaRoot, 'migrations', 'migration_lock.toml'),
    path.join(migrationsDirectory, 'migration_lock.toml'),
  );

  const copied = new Set();
  const addMigrations = async (ids) => {
    for (const id of ids) {
      if (copied.has(id)) continue;
      await copy(path.join(prismaRoot, 'migrations', id), path.join(migrationsDirectory, id), {
        recursive: true,
      });
      copied.add(id);
    }
  };
  await addMigrations(migrationIds);
  await write(
    configPath,
    `import { defineConfig, env } from 'prisma/config';\n\nexport default defineConfig({\n  schema: ${JSON.stringify(path.join(stagedPrismaRoot, 'schema.prisma'))},\n  migrations: { path: ${JSON.stringify(migrationsDirectory)} },\n  datasource: { url: env('DATABASE_URL') },\n});\n`,
    'utf8',
  );
  return { configPath, migrationsDirectory, addMigrations };
}

async function verifyMigrationHistory(client, expectedIds) {
  const result = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at`,
  );
  const actual = result.rows.map(({ migration_name }) => migration_name);
  if (JSON.stringify(actual) !== JSON.stringify(expectedIds)) {
    throw new Error(`Prisma migration history mismatch: expected ${expectedIds.join(', ')}, got ${actual.join(', ')}`);
  }
}

async function withPostgres16(label, operation) {
  let container;
  let client;
  let temporaryDirectory;
  await runWithCleanup(
    async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();
      temporaryDirectory = await mkdtemp(path.join(packageDirectory, '.migration-test-'));
      const version = await client.query('SHOW server_version');
      if (!version.rows[0].server_version.startsWith('16.')) {
        throw new Error(`Expected PostgreSQL 16, received ${version.rows[0].server_version}`);
      }
      await operation(client, container.getConnectionUri(), temporaryDirectory);
      process.stdout.write(`PASS migration:${label} on PostgreSQL ${version.rows[0].server_version}\n`);
    },
    () => cleanupResources(client, container, temporaryDirectory),
  ).catch((error) => {
    const details =
      error instanceof AggregateError
        ? error.errors.map((item) => item?.stack ?? String(item)).join('\n')
        : error?.stack ?? String(error);
    throw new Error(
      `migration:${label} failed; PostgreSQL 16 Testcontainer errors are fatal\n${details}`,
      { cause: error },
    );
  });
}

async function runEmpty() {
  await withPostgres16('empty', async (client, databaseUrl, temporaryDirectory) => {
    const staged = await stageMigrationHistory({ temporaryDirectory, migrationIds: ALL_MIGRATIONS });
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, ALL_MIGRATIONS);
    await verifySchemaInventory(client);
  });
}

async function runUpgrade() {
  await withPostgres16('upgrade', async (client, databaseUrl, temporaryDirectory) => {
    const staged = await stageMigrationHistory({
      temporaryDirectory,
      migrationIds: [M0_MIGRATION],
    });
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, [M0_MIGRATION]);

    const fixture = await sqlFile('packages', 'db', 'test', 'fixtures', 'm0-n-1.sql');
    await client.query(fixture);
    const before = await captureM0State(client);
    verifyM0Baseline(before);

    await staged.addMigrations(W11_MIGRATIONS.map(({ id }) => id));
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, ALL_MIGRATIONS);
    await verifyM0Upgrade(client, before);
    await verifySchemaInventory(client);
  });
}

async function main() {
  const mode = process.argv[2] ?? 'all';
  if (!MODES.has(mode)) {
    throw new Error(`Unknown migration test mode "${mode}". Expected empty, upgrade, or all.`);
  }
  if (mode === 'all') {
    await assertExpandOnlyMigrations();
    await runEmpty();
    await runUpgrade();
  } else if (mode === 'empty') {
    await runEmpty();
  } else {
    await runUpgrade();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
