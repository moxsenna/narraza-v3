import { describe, expect, it, vi } from 'vitest';
import { clearMailpit, waitForMailLink } from './mailpit';

const recipient = 'auth-smoke@example.test';
const subject = 'Verifikasi email Narraza-mu';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('clearMailpit', () => {
  it('deletes all messages through the Mailpit API', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    await clearMailpit('http://localhost:8026', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8026/api/v1/messages', {
      method: 'DELETE',
    });
  });
});

describe('waitForMailLink', () => {
  it('polls for exact recipient and subject, then extracts link from fetched message', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            {
              ID: 'wrong-recipient',
              Subject: subject,
              To: [{ Address: 'other@example.test' }],
            },
            {
              ID: 'wrong-subject',
              Subject: `${subject}!`,
              To: [{ Address: recipient }],
            },
            {
              ID: 'wanted',
              Subject: subject,
              To: [{ Address: recipient }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Text: 'Buka https://localhost:3000/verifikasi/konfirmasi?token=secret-token sekarang.',
          HTML: '',
        }),
      );

    const link = await waitForMailLink({
      apiBaseUrl: 'http://localhost:8026',
      recipient,
      subject,
      fetchImpl,
      timeoutMs: 100,
      pollIntervalMs: 0,
    });

    expect(link).toBe('https://localhost:3000/verifikasi/konfirmasi?token=secret-token');
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'http://localhost:8026/api/v1/message/wanted');
  });

  it('decodes an HTML link without exposing token through logs', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [{ ID: 'html', Subject: subject, To: [{ Address: recipient }] }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Text: '',
          HTML: '<a href="http://localhost:3000/reset-password/konfirmasi?token=a%2Fb&amp;x=1">Reset</a>',
        }),
      );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const link = await waitForMailLink({
      apiBaseUrl: 'http://localhost:8026/',
      recipient,
      subject,
      fetchImpl,
      timeoutMs: 100,
      pollIntervalMs: 0,
    });

    expect(link).toBe('http://localhost:3000/reset-password/konfirmasi?token=a%2Fb&x=1');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('fails with recipient and subject context after timeout', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ messages: [] }));

    await expect(
      waitForMailLink({
        apiBaseUrl: 'http://localhost:8026',
        recipient,
        subject,
        fetchImpl,
        timeoutMs: 0,
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow(`Mailpit message not found for ${recipient} with subject "${subject}"`);
  });
});
