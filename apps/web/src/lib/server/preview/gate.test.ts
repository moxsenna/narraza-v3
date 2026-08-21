import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMyProject: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../server/domain/queries', () => ({ getMyProject: mocks.getMyProject }));
vi.mock('../../../server/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { evaluatePreviewPolicy, resolvePreviewAccess } from './gate';

describe('preview gate policy', () => {
  test.each(['production', 'staging', 'unknown'] as const)('%s is denied', (environment) => {
    expect(
      evaluatePreviewPolicy({
        environment,
        authenticated: true,
        scenarioAllowed: true,
        scopeAuthorized: true,
        automated: true,
      }),
    ).toEqual({ allowed: false });
  });

  test('development requires authenticated allowlisted authorized scope', () => {
    expect(
      evaluatePreviewPolicy({
        environment: 'development',
        authenticated: false,
        scenarioAllowed: true,
        scopeAuthorized: true,
        automated: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePreviewPolicy({
        environment: 'development',
        authenticated: true,
        scenarioAllowed: false,
        scopeAuthorized: true,
        automated: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePreviewPolicy({
        environment: 'development',
        authenticated: true,
        scenarioAllowed: true,
        scopeAuthorized: false,
        automated: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePreviewPolicy({
        environment: 'development',
        authenticated: true,
        scenarioAllowed: true,
        scopeAuthorized: true,
        automated: false,
      }),
    ).toEqual({ allowed: true });
  });

  test('test environment allows only the automated authenticated policy path', () => {
    expect(
      evaluatePreviewPolicy({
        environment: 'test',
        authenticated: true,
        scenarioAllowed: true,
        scopeAuthorized: true,
        automated: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluatePreviewPolicy({
        environment: 'test',
        authenticated: true,
        scenarioAllowed: true,
        scopeAuthorized: true,
        automated: true,
      }),
    ).toEqual({ allowed: true });
  });

  test('production denies even when a custom environment marker says development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NARRAZA_ENV', 'development');
    mocks.getCurrentUser.mockResolvedValue({
      userId: 'user-1',
      status: 'active',
      email: 'author@example.com',
    });

    await expect(resolvePreviewAccess({ scenarioKey: 'kredit-unavailable' })).resolves.toBeNull();

    vi.unstubAllEnvs();
  });

  test('test denies without CI even when a custom environment marker says development', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NARRAZA_ENV', 'development');
    vi.stubEnv('CI', 'false');
    mocks.getCurrentUser.mockResolvedValue({
      userId: 'user-1',
      status: 'active',
      email: 'author@example.com',
    });

    await expect(resolvePreviewAccess({ scenarioKey: 'kredit-unavailable' })).resolves.toBeNull();

    vi.unstubAllEnvs();
  });

  test('inactive authenticated session is denied', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NARRAZA_ENV', 'development');
    mocks.getCurrentUser.mockResolvedValue({
      userId: 'user-1',
      status: 'suspended',
      email: 'author@example.com',
    });

    await expect(resolvePreviewAccess({ scenarioKey: 'kredit-unavailable' })).resolves.toBeNull();

    vi.unstubAllEnvs();
  });

  test('preview sources contain no public-env bypass, browser storage, or real-data fixture fallback', () => {
    const source = [
      readFileSync(new URL('./gate.ts', import.meta.url), 'utf8'),
      readFileSync(
        new URL(
          '../../../app/(preview)/app/%255F_preview/frontend-parity/page.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
    ].join('\n');

    expect(source).not.toMatch(/NEXT_PUBLIC_/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/realData\s*(?:\?\?|\|\|)\s*fixture/);
    expect(source).not.toMatch(/catch\s*\([^)]*\)\s*=>\s*fixture/);
    expect(source).not.toMatch(/authenticated\s*[:=]\s*(?:true|false).*searchParams/i);
    expect(source).toMatch(/export const dynamic = 'force-dynamic'/);
  });
});
