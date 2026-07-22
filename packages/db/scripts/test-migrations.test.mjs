import { describe, expect, it, vi } from 'vitest';
import {
  deployWithPrisma,
  runWithCleanup,
  stageMigrationHistory,
} from './test-migrations.mjs';

describe('deployWithPrisma', () => {
  it('invokes production migrate deploy with DATABASE_URL and explicit config', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);

    await deployWithPrisma({
      databaseUrl: 'postgresql://postgres:secret@localhost:5432/test',
      configPath: 'C:/temp/prisma.config.ts',
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      ['exec', 'prisma', 'migrate', 'deploy', '--config', 'C:/temp/prisma.config.ts'],
      expect.objectContaining({
        cwd: expect.any(String),
        env: expect.objectContaining({
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/test',
        }),
      }),
    );
  });
});

describe('stageMigrationHistory', () => {
  it('copies baseline first, then adds W1.1 migrations to same history root', async () => {
    const copied = [];
    const copy = vi.fn(async (source, destination) => copied.push([source, destination]));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const staged = await stageMigrationHistory({
      temporaryDirectory: 'C:/temp/history',
      migrationIds: ['20260721181246_init_m0_auth'],
      copy,
      writeFile,
      mkdir,
    });
    await staged.addMigrations(['20260722090000_planning_expand']);

    expect(copied.map(([source]) => source.replaceAll('\\', '/'))).toEqual([
      expect.stringMatching(/prisma\/schema\.prisma$/),
      expect.stringMatching(/prisma\/migrations\/migration_lock\.toml$/),
      expect.stringMatching(/20260721181246_init_m0_auth$/),
      expect.stringMatching(/20260722090000_planning_expand$/),
    ]);
    expect(copied[2][1].replaceAll('\\', '/')).toContain('/migrations/20260721181246_init_m0_auth');
    expect(copied[3][1].replaceAll('\\', '/')).toContain('/migrations/20260722090000_planning_expand');
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/prisma\.config\.ts$/),
      expect.stringContaining("env('DATABASE_URL')"),
      'utf8',
    );
  });
});

describe('runWithCleanup', () => {
  it('preserves operation error when cleanup succeeds', async () => {
    const primary = new Error('operation failed');
    await expect(
      runWithCleanup(
        async () => {
          throw primary;
        },
        async () => undefined,
      ),
    ).rejects.toBe(primary);
  });

  it('fails with cleanup error when operation succeeds', async () => {
    const cleanup = new Error('cleanup failed');
    await expect(runWithCleanup(async () => 'ok', async () => Promise.reject(cleanup))).rejects.toBe(
      cleanup,
    );
  });

  it('aggregates operation and cleanup errors without losing either', async () => {
    const primary = new Error('operation failed');
    const cleanup = new Error('cleanup failed');

    try {
      await runWithCleanup(
        async () => Promise.reject(primary),
        async () => Promise.reject(cleanup),
      );
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(error.errors).toEqual([primary, cleanup]);
    }
  });
});
