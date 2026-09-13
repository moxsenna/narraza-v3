import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMailer } from './mailer';

function mockFetchOnce(status: number, body: unknown) {
  const stub = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', stub);
  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mailketing mailer', () => {
  test('posts verify email to mailketing send endpoint', async () => {
    const fetchStub = mockFetchOnce(200, { success: true, data: {}, message: 'OK' });
    const mailer = createMailer({
      from: 'Narraza <no-reply@narraza.web.id>',
      mailketingApiToken: 'token-123',
    });
    await mailer.sendVerifyEmail({ to: 'user@example.test', url: 'https://x/verify' });

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mailketing.co.id/api/v2/send');
    expect((init.headers as Record<string, string>)['X-Api-Token']).toBe('token-123');
    const payload = JSON.parse(init.body as string) as Record<string, string>;
    expect(payload).toMatchObject({
      from_name: 'Narraza',
      from_email: 'no-reply@narraza.web.id',
      subject: 'Verifikasi email Narraza-mu',
      recipient: 'user@example.test',
    });
    expect(payload.content).toContain('https://x/verify');
  });

  test('http failure and success:false both throw', async () => {
    const mailer = createMailer({ from: 'a@b.test', mailketingApiToken: 'token-123' });
    mockFetchOnce(401, { success: false, data: null, message: 'Invalid API token' });
    await expect(mailer.sendPasswordReset({ to: 'u@t.test', url: 'https://x' })).rejects.toThrow(
      /Mailketing send failed: 401/,
    );
    mockFetchOnce(200, { success: false, data: null, message: 'Validation failed' });
    await expect(mailer.sendPasswordReset({ to: 'u@t.test', url: 'https://x' })).rejects.toThrow(
      /Mailketing send rejected/,
    );
  });

  test('no transport configured throws misconfigured', async () => {
    const mailer = createMailer({ from: 'a@b.test' });
    await expect(mailer.sendVerifyEmail({ to: 'u@t.test', url: 'https://x' })).rejects.toThrow(
      /misconfigured/,
    );
  });
});
