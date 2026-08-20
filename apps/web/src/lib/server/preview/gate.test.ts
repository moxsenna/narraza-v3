import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { evaluatePreviewPolicy } from './gate';

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

  test('preview sources contain no public-env bypass, browser storage, or real-data fixture fallback', () => {
    const source = [
      readFileSync(new URL('./gate.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../../../app/app/__preview/frontend-parity/page.tsx', import.meta.url), 'utf8'),
    ].join('\n');

    expect(source).not.toMatch(/NEXT_PUBLIC_/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/realData\s*(?:\?\?|\|\|)\s*fixture/);
    expect(source).not.toMatch(/catch\s*\([^)]*\)\s*=>\s*fixture/);
    expect(source).not.toMatch(/authenticated\s*[:=]\s*(?:true|false).*searchParams/i);
  });
});
