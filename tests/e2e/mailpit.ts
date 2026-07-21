interface MailpitAddress {
  Address?: string;
}

interface MailpitSummary {
  ID?: string;
  Subject?: string;
  To?: MailpitAddress[];
}

interface MailpitListResponse {
  messages?: MailpitSummary[];
}

interface MailpitMessage {
  Text?: string;
  HTML?: string;
}

type Fetch = typeof fetch;

export interface WaitForMailLinkOptions {
  apiBaseUrl: string;
  recipient: string;
  subject: string;
  fetchImpl?: Fetch;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function apiUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/$/, '')}${pathname}`;
}

async function checkedJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`Mailpit ${operation} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function decodeHtmlEntities(value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&#38;', '&');
}

function extractHttpLink(message: MailpitMessage): string | undefined {
  const content = `${message.Text ?? ''}\n${message.HTML ?? ''}`;
  const match = content.match(/https?:\/\/[^\s<>"']+/i);
  return match ? decodeHtmlEntities(match[0]).replace(/[.,);]+$/, '') : undefined;
}

export async function clearMailpit(apiBaseUrl: string, fetchImpl: Fetch = fetch): Promise<void> {
  const response = await fetchImpl(apiUrl(apiBaseUrl, '/api/v1/messages'), {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Mailpit clear failed with HTTP ${response.status}`);
  }
}

export async function waitForMailLink(options: WaitForMailLinkOptions): Promise<string> {
  const {
    apiBaseUrl,
    recipient,
    subject,
    fetchImpl = fetch,
    timeoutMs = 30_000,
    pollIntervalMs = 250,
  } = options;
  const deadline = Date.now() + timeoutMs;

  do {
    const listResponse = await fetchImpl(apiUrl(apiBaseUrl, '/api/v1/messages'));
    const list = await checkedJson<MailpitListResponse>(listResponse, 'list');
    const summary = list.messages?.find(
      (message) =>
        message.Subject === subject &&
        message.To?.some((address) => address.Address?.toLowerCase() === recipient.toLowerCase()),
    );

    if (summary?.ID) {
      const messageResponse = await fetchImpl(
        apiUrl(apiBaseUrl, `/api/v1/message/${encodeURIComponent(summary.ID)}`),
      );
      const message = await checkedJson<MailpitMessage>(messageResponse, 'message fetch');
      const link = extractHttpLink(message);
      if (!link) {
        throw new Error(
          `Mailpit message for ${recipient} with subject "${subject}" has no HTTP link`,
        );
      }
      return link;
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  } while (Date.now() < deadline);

  throw new Error(`Mailpit message not found for ${recipient} with subject "${subject}"`);
}
