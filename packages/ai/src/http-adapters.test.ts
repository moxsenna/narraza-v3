import { describe, expect, it, vi } from 'vitest';
import { ProviderRefusalError } from './classify-error.js';
import { ModelPolicyViolation } from './model-policy.js';
import {
  createGeminiProvider,
  createOpenAICompatibleProvider,
  createOpenRouterProvider,
} from './http-adapters.js';

const base = {
  providerId: 'ignored-by-adapter',
  requestedModelId: 'test-model',
  structuredOutput: true,
  timeoutMs: 5_000,
  maxInputTokens: 1_000,
  maxOutputTokens: 321,
  dataClass: 'review_safe' as const,
  systemPrompt: 'system',
  userPrompt: 'user',
};

describe('real provider adapters (no-network contract)', () => {
  it('maps one OpenRouter response and performs exactly one injected fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'or-request',
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await createOpenRouterProvider({
      apiKey: 'test-key',
      fetch,
    }).executeSingleAttempt(base);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      max_tokens: 321,
    });
    expect(result).toMatchObject({
      providerRequestId: 'or-request',
      rawBody: '{"ok":true}',
      usage: { inputTokens: 7, outputTokens: 3, providerReportedCostMicroIdr: null },
    });
  });

  it('maps one Gemini response and performs exactly one injected fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          responseId: 'gem-request',
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await createGeminiProvider({ apiKey: 'test-key', fetch }).executeSingleAttempt(
      base,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      generationConfig: { maxOutputTokens: 321, responseMimeType: 'application/json' },
    });
    expect(result).toMatchObject({
      providerRequestId: 'gem-request',
      rawBody: '{"ok":true}',
      usage: { inputTokens: 9, outputTokens: 4, providerReportedCostMicroIdr: null },
    });
  });

  it.each([
    ['OpenRouter', createOpenRouterProvider({ apiKey: 'test-key', fetch: vi.fn() })],
    ['Gemini', createGeminiProvider({ apiKey: 'test-key', fetch: vi.fn() })],
    [
      'NineRouter',
      createOpenAICompatibleProvider({
        apiKey: 'test-key',
        baseUrl: 'https://nine.example/v1/',
        providerId: 'nine-router',
        fetch: vi.fn(),
      }),
    ],
  ])('%s rejects UTF-8 input above frozen ceiling before fetch', async (_name, provider) => {
    await expect(
      provider.executeSingleAttempt({ ...base, userPrompt: 'é', maxInputTokens: 8 }),
    ).rejects.toMatchObject({ name: 'ProviderInputLimitError' });
  });

  it.each([
    ['OpenRouter', createOpenRouterProvider({ apiKey: 'test-key', fetch: vi.fn() })],
    ['Gemini', createGeminiProvider({ apiKey: 'test-key', fetch: vi.fn() })],
  ])('%s blocks restricted data before fetch', async (_name, provider) => {
    await expect(
      provider.executeSingleAttempt({ ...base, dataClass: 'author_private' }),
    ).rejects.toBeInstanceOf(ModelPolicyViolation);
  });

  it('maps one nine-router response against the configured base URL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'nr-request',
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 5, completion_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await createOpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://nine.example/v1/',
      providerId: 'nine-router',
      fetch,
    }).executeSingleAttempt({ ...base, requestedModelId: 'gweb/gemini-3.8-flash' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://nine.example/v1/chat/completions');
    expect(JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      model: 'gweb/gemini-3.8-flash',
      max_tokens: 321,
    });
    expect(result).toMatchObject({
      providerRequestId: 'nr-request',
      rawBody: '{"ok":true}',
      usage: { inputTokens: 5, outputTokens: 2, providerReportedCostMicroIdr: null },
    });
  });

  it('tolerates one trailing SSE data:[DONE] trailer (nine-router wire quirk)', async () => {
    const body =
      '{"id":"nr-sse","choices":[{"message":{"content":"PONG"}}],' +
      '"usage":{"prompt_tokens":20,"completion_tokens":1}}data: [DONE]\n';
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(body, { status: 200 }));
    const result = await createOpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://nine.example/v1',
      providerId: 'nine-router',
      fetch,
    }).executeSingleAttempt({ ...base, requestedModelId: 'gweb/gemini-3.8-flash' });
    expect(result).toMatchObject({
      providerRequestId: 'nr-sse',
      rawBody: 'PONG',
      usage: { inputTokens: 20, outputTokens: 1 },
    });
  });

  it('refuses garbage bodies instead of guessing', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('not json at all', { status: 200 }));
    await expect(
      createOpenAICompatibleProvider({
        apiKey: 'test-key',
        baseUrl: 'https://nine.example/v1',
        providerId: 'nine-router',
        fetch,
      }).executeSingleAttempt(base),
    ).rejects.toBeInstanceOf(ProviderRefusalError);
  });
});
