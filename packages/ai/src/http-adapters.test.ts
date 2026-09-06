import { describe, expect, it, vi } from 'vitest';
import { ModelPolicyViolation } from './model-policy.js';
import { createGeminiProvider, createOpenRouterProvider } from './http-adapters.js';

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
});
