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
const RELEASE_VOCABULARY_MIGRATION = '20260728230906_credit_ledger_release_vocabulary';
const CREDIT_ENGINE_V1 = '20260816094500_credit_engine_v1';
export const PRE_VOCABULARY_MIGRATIONS = [M0_MIGRATION, ...W11_MIGRATIONS.map(({ id }) => id)];
export const FINAL_MIGRATIONS = [
  ...PRE_VOCABULARY_MIGRATIONS,
  RELEASE_VOCABULARY_MIGRATION,
  CREDIT_ENGINE_V1,
];
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
  const errors = results.filter(({ status }) => status === 'rejected').map(({ reason }) => reason);
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
    throw new Error(
      `Prisma migration history mismatch: expected ${expectedIds.join(', ')}, got ${actual.join(', ')}`,
    );
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
      process.stdout.write(
        `PASS migration:${label} on PostgreSQL ${version.rows[0].server_version}\n`,
      );
    },
    () => cleanupResources(client, container, temporaryDirectory),
  ).catch((error) => {
    const details =
      error instanceof AggregateError
        ? error.errors.map((item) => item?.stack ?? String(item)).join('\n')
        : (error?.stack ?? String(error));
    throw new Error(
      `migration:${label} failed; PostgreSQL 16 Testcontainer errors are fatal\n${details}`,
      { cause: error },
    );
  });
}

async function runEmpty() {
  await withPostgres16('empty', async (client, databaseUrl, temporaryDirectory) => {
    const staged = await stageMigrationHistory({
      temporaryDirectory,
      migrationIds: FINAL_MIGRATIONS,
    });
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, FINAL_MIGRATIONS);
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
    await verifyMigrationHistory(client, PRE_VOCABULARY_MIGRATIONS);

    await client.query(
      `INSERT INTO credit_ledger
         (id,user_id,project_id,reservation_id,attempt_id,entry_type,direction,amount_micro_idr,dedupe_key,created_at)
       VALUES ('upgrade-reservation-release',NULL,NULL,NULL,NULL,'reservation_release','credit',12345,'upgrade-reservation-release','2026-07-22T09:31:00.000Z')`,
    );
    const ledgerBefore = await client.query(
      `SELECT * FROM credit_ledger WHERE id = 'upgrade-reservation-release'`,
    );

    await staged.addMigrations([RELEASE_VOCABULARY_MIGRATION]);
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, [
      ...PRE_VOCABULARY_MIGRATIONS,
      RELEASE_VOCABULARY_MIGRATION,
    ]);

    const ledgerAfter = await client.query(
      `SELECT * FROM credit_ledger WHERE id = 'upgrade-reservation-release'`,
    );
    if (ledgerBefore.rowCount !== 1 || ledgerAfter.rowCount !== 1) {
      throw new Error(
        'Expected exactly one seeded ledger row before and after vocabulary migration',
      );
    }
    const expectedLedgerAfter = { ...ledgerBefore.rows[0], entry_type: 'release' };
    if (JSON.stringify(ledgerAfter.rows[0]) !== JSON.stringify(expectedLedgerAfter)) {
      throw new Error('Vocabulary migration changed ledger fields other than entry_type');
    }
    const oldRows = await client.query(
      `SELECT COUNT(*)::integer AS count FROM credit_ledger WHERE entry_type = 'reservation_release'`,
    );
    if (oldRows.rows[0].count !== 0) {
      throw new Error(`Expected no reservation_release rows, found ${oldRows.rows[0].count}`);
    }

    // Seed a representative W3.2 graph (project → snapshot → bundle → plan,
    // job, quote, reservation) on the pre-W3.3 schema and capture exact tuples.
    const W32_HASH = 'c'.repeat(64);
    await client.query(
      `INSERT INTO projects
         (id,owner_user_id,title,intake_path,status,current_canonical_version,revision,created_at,updated_at)
       VALUES ('w32-project','m0-user-active','W32 Upgrade','guided','active',0,0,now(),now())`,
    );
    await client.query(
      `INSERT INTO context_snapshots
         (id,project_id,packet_kind,data_class,dependency_hash,content_hash,schema_version,payload,created_at)
       VALUES ('w32-snapshot','w32-project','writer','writer_safe',$1,$1,1,'{}',now())`,
      [W32_HASH],
    );
    await client.query(
      `INSERT INTO generation_context_bundles
         (id,project_id,snapshot_id,dependency_hash,bundle_hash,expires_at,schema_version,payload,created_at)
       VALUES ('w32-bundle','w32-project','w32-snapshot',$1,$1,now() + interval '1 hour',1,'{}',now())`,
      [W32_HASH],
    );
    await client.query(
      `INSERT INTO ai_workflow_plans
         (id,project_id,bundle_id,workflow_kind,plan_hash,estimated_max_micro_idr,schema_version,payload,created_at)
       VALUES ('w32-plan','w32-project','w32-bundle','prose',$1,1000,1,'{}',now())`,
      [W32_HASH],
    );
    await client.query(
      `INSERT INTO generation_jobs
         (id,project_id,kind,status,priority,available_at,fence_version,bundle_id,workflow_plan_id,reservation_id,schema_version,payload,created_at,updated_at)
       VALUES ('w32-job','w32-project','prose','queued',0,now(),0,'w32-bundle','w32-plan',NULL,1,'{}',now(),now())`,
    );
    await client.query(
      `INSERT INTO credit_quotes
         (id,user_id,project_id,workflow_plan_id,workflow_plan_hash,dependency_hash,max_amount_micro_idr,expires_at,request_id,created_at)
       VALUES ('w32-quote','m0-user-active','w32-project','w32-plan',$1,$1,1000,now() + interval '10 minutes','w32-issuance',now())`,
      [W32_HASH],
    );
    await client.query(
      `INSERT INTO credit_reservations
         (id,user_id,project_id,job_id,status,reserved_micro_idr,settled_micro_idr,released_micro_idr,exposure_micro_idr,closing_at,created_at,updated_at)
       VALUES ('w32-reservation','m0-user-active','w32-project','w32-job','open',100,0,0,100,NULL,now(),now())`,
    );

    const stableJson = (row) => JSON.stringify(row, Object.keys(row).sort());
    const w32Before = {
      job: (await client.query(`SELECT * FROM generation_jobs WHERE id = 'w32-job'`)).rows[0],
      quote: (await client.query(`SELECT * FROM credit_quotes WHERE id = 'w32-quote'`)).rows[0],
      reservation: (
        await client.query(`SELECT * FROM credit_reservations WHERE id = 'w32-reservation'`)
      ).rows[0],
    };

    // Apply W3.3 on top of the representative W3.2 state.
    await staged.addMigrations([CREDIT_ENGINE_V1]);
    await deployWithPrisma({ databaseUrl, configPath: staged.configPath });
    await verifyMigrationHistory(client, FINAL_MIGRATIONS);

    const w32JobAfter = (await client.query(`SELECT * FROM generation_jobs WHERE id = 'w32-job'`))
      .rows[0];
    const w32QuoteAfter = (await client.query(`SELECT * FROM credit_quotes WHERE id = 'w32-quote'`))
      .rows[0];
    const w32ReservationAfter = (
      await client.query(`SELECT * FROM credit_reservations WHERE id = 'w32-reservation'`)
    ).rows[0];

    // Existing job and quote semantic fields are unchanged by W3.3.
    if (stableJson(w32JobAfter) !== stableJson(w32Before.job)) {
      throw new Error('W3.3 migration changed existing generation_jobs fields');
    }
    if (stableJson(w32QuoteAfter) !== stableJson(w32Before.quote)) {
      throw new Error('W3.3 migration changed existing credit_quotes fields');
    }

    // Existing reservation financial/binding fields are unchanged; only the
    // new nullable W3.3 linkage columns appear, and they must be NULL.
    // funding_model (Amendment #16) also arrives NULL on upgrade: all
    // pre-W3.3 reservations keep legacy classification.
    const { quote_id, confirmation_request_id, funding_model, ...reservationCore } =
      w32ReservationAfter;
    if (quote_id !== null || confirmation_request_id !== null) {
      throw new Error('Legacy reservation must keep NULL quote_id/confirmation_request_id');
    }
    if (funding_model !== null) {
      throw new Error('Legacy reservation must receive NULL funding_model on upgrade');
    }
    if (stableJson(reservationCore) !== stableJson(w32Before.reservation)) {
      throw new Error('W3.3 migration changed existing credit_reservations fields');
    }

    // Verify pre-existing rows are preserved after W3.3 migration
    const ledgerStillThere = await client.query(
      `SELECT * FROM credit_ledger WHERE id = 'upgrade-reservation-release'`,
    );
    if (ledgerStillThere.rowCount !== 1) {
      throw new Error('W3.3 migration did not preserve existing ledger rows');
    }

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
