import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, test as vitestTest, type TestContext } from 'vitest';
import { isCiEnvironment } from './ci.js';
import { cleanDatabase } from './fixtures.js';

const execFileAsync = promisify(execFile);
const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface SchemaTestContext {
  client: Pool;
  databaseUrl: string;
}

type SchemaTestBody = (
  context: SchemaTestContext & { vitest: TestContext },
) => Promise<void> | void;

export interface SchemaTestSuite {
  test: (name: string, body: SchemaTestBody, timeout?: number) => void;
}

function dockerUnavailableMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `[schema-test] SKIP: Docker unavailable; PostgreSQL 16 Testcontainer could not start. ${detail}`;
}

async function deployMigrations(databaseUrl: string): Promise<void> {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm exec prisma migrate deploy']
      : ['exec', 'prisma', 'migrate', 'deploy'];
  await execFileAsync(command, args, {
    cwd: packageDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export function createSchemaTestSuite(): SchemaTestSuite {
  let container: StartedPostgreSqlContainer | undefined;
  let client: Pool | undefined;
  let databaseUrl: string | undefined;
  let localSkipReason: string | undefined;

  beforeAll(async () => {
    try {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
    } catch (error) {
      if (isCiEnvironment(process.env.CI)) {
        throw new Error(
          '[schema-test] CI requires Docker and PostgreSQL 16 Testcontainers; startup failed.',
          { cause: error },
        );
      }
      localSkipReason = dockerUnavailableMessage(error);
      console.warn(localSkipReason);
      return;
    }

    databaseUrl = container.getConnectionUri();
    try {
      await deployMigrations(databaseUrl);
      client = new Pool({ connectionString: databaseUrl, max: 20 });
    } catch (error) {
      await container.stop().catch(() => undefined);
      container = undefined;
      throw new Error('[schema-test] Failed to deploy migrations into PostgreSQL 16 container.', {
        cause: error,
      });
    }
  }, 120_000);

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  return {
    test(name, body, timeout = 30_000) {
      vitestTest(
        name,
        async (vitest) => {
          if (localSkipReason) {
            vitest.skip(localSkipReason);
            return;
          }
          if (!client || !databaseUrl) {
            throw new Error('[schema-test] Harness did not initialize PostgreSQL connection');
          }
          await cleanDatabase(client);
          await body({ client, databaseUrl, vitest });
        },
        timeout,
      );
    },
  };
}
