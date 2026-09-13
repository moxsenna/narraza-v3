import { describe, expect, test, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from './route.js';

vi.mock('@narraza/shared/env/web', () => ({
  loadWebEnv: () => ({ APP_URL: 'https://narraza.web.id' }),
}));
vi.mock('../../../server/auth/session.js', () => ({
  PENDING_VERIFY_COOKIE: 'narraza_pending_verify',
  setPendingToken: vi.fn(async () => undefined),
}));

class FakeHeaders {
  private map: Record<string, string>;
  constructor(init: Record<string, string> = {}) {
    this.map = init;
  }
  get(name: string): string | null {
    return this.map[name.toLowerCase()] ?? null;
  }
}

function fakeRequest(url: string, headers: Record<string, string> = {}) {
  return {
    headers: new FakeHeaders(headers),
    nextUrl: new URL(url),
    url,
  } as unknown as NextRequest;
}

describe('verifikasi/konfirmasi redirect', () => {
  test('internal origin behind proxy resolves to the public host', async () => {
    const res = await GET(
      fakeRequest('http://localhost:5400/verifikasi/konfirmasi?token=abc', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'narraza.web.id',
      }),
    );
    expect(res.headers.get('location')).toBe('https://narraza.web.id/verifikasi/selesaikan');
  });

  test('falls back to APP_URL without proxy headers', async () => {
    const res = await GET(fakeRequest('http://localhost:5400/verifikasi/konfirmasi?token=abc'));
    expect(res.headers.get('location')).toBe('https://narraza.web.id/verifikasi/selesaikan');
  });
});
