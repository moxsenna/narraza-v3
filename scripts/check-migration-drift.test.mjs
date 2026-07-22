import { describe, expect, it, vi } from 'vitest';
import * as driftChecker from './check-migration-drift.mjs';

describe('migration drift SQL output', () => {
  it('fails when Prisma returns a non-empty SQL diff with status zero', () => {
    expect(typeof driftChecker.assertEmptySqlDiff).toBe('function');
    expect(() =>
      driftChecker.assertEmptySqlDiff(
        'migration-to-DB',
        'CREATE TABLE "unexpected" ("id" text);\n',
      ),
    ).toThrow('migration-to-DB drift detected');
  });

  it('accepts whitespace-only SQL output', () => {
    expect(typeof driftChecker.assertEmptySqlDiff).toBe('function');
    expect(() => driftChecker.assertEmptySqlDiff('schema-to-DB', ' \n\t')).not.toThrow();
  });

  it('accepts Prisma empty migration marker as explicitly empty SQL', () => {
    expect(() =>
      driftChecker.assertEmptySqlDiff('migration-to-DB', '-- This is an empty migration.\n'),
    ).not.toThrow();
  });

  it('requests SQL scripts and checks both drift directions', () => {
    expect(typeof driftChecker.checkMigrationDrift).toBe('function');
    const execute = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

    driftChecker.checkMigrationDrift(execute);

    expect(execute).toHaveBeenNthCalledWith(
      2,
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
    expect(execute).toHaveBeenNthCalledWith(
      3,
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
  });
});
