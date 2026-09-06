import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMyProject: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../server/domain/queries', () => ({ getMyProject: mocks.getMyProject }));
// The harness module imports the M3 generation adapter (which pulls the real
// application package). The CI Unit job does not build workspace packages, so
// — like every other web unit test — the server-domain seam is mocked and the
// pure policy logic under test stays real.
vi.mock('../../../server/domain/generation', () => ({
  assertSceneChapterAccess: vi.fn(),
}));

import { resolveM4VerticalAccess } from './m4-vertical-harness';

describe('M4 vertical harness gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('foreign or missing project is a non-enumerating not-found', async () => {
    mocks.getMyProject.mockResolvedValue(null);
    vi.stubEnv('NARRAZA_ENV', 'development');
    vi.stubEnv('NODE_ENV', 'development');
    await expect(resolveM4VerticalAccess('project-x')).resolves.toEqual({ kind: 'not_found' });
  });

  test.each(['production', 'staging', 'unknown'] as const)(
    '%s environment is denied even for the owner',
    async (environment) => {
      mocks.getMyProject.mockResolvedValue({ id: 'p1', ownerUserId: 'u1' });
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NARRAZA_ENV', environment);
      await expect(resolveM4VerticalAccess('p1')).resolves.toEqual({ kind: 'not_found' });
    },
  );

  test('development owner access is allowed', async () => {
    mocks.getMyProject.mockResolvedValue({ id: 'p1', ownerUserId: 'u1' });
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NARRAZA_ENV', 'development');
    await expect(resolveM4VerticalAccess('p1')).resolves.toEqual({
      kind: 'allowed',
      userId: 'u1',
    });
  });

  test('test environment is allowed (CI/E2E automation path)', async () => {
    mocks.getMyProject.mockResolvedValue({ id: 'p1', ownerUserId: 'u1' });
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NARRAZA_ENV', 'test');
    await expect(resolveM4VerticalAccess('p1')).resolves.toEqual({
      kind: 'allowed',
      userId: 'u1',
    });
  });
});
