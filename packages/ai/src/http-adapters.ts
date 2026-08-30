import {
  ProviderRateLimitedError,
  ProviderRefusalError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './classify-error.js';
import { assertModelPolicy } from './model-policy.js';
import type { ProviderPort, SingleAttemptRequest, SingleAttemptResponse } from './provider-port.js';

export interface HttpAdapterOptions {
  readonly apiKey: string;
  readonly fetch?: typeof globalThis.fetch;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function requestJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ readonly response: Response; readonly json: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: timeoutSignal(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new ProviderTimeoutError();
    }
    throw new ProviderUnavailableError(null);
  }
  if (response.status === 429) throw new ProviderRateLimitedError(429);
  if (response.status === 408 || response.status >= 500) {
    throw new ProviderUnavailableError(response.status);
  }
  if (!response.ok) throw new ProviderRefusalError(response.headers.get('x-request-id'));
  return { response, json: (await response.json()) as unknown };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function createOpenRouterProvider(options: HttpAdapterOptions): ProviderPort {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    async executeSingleAttempt(request): Promise<SingleAttemptResponse> {
      assertModelPolicy({ providerId: 'openrouter', dataClass: request.dataClass });
      const result = await requestJson(
        fetchImpl,
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.requestedModelId,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userPrompt },
            ],
            ...(request.structuredOutput ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        request.timeoutMs,
      );
      const body = result.json as {
        id?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown };
      };
      const rawBody = body.choices?.[0]?.message?.content;
      if (typeof rawBody !== 'string') throw new ProviderRefusalError(null);
      return {
        providerRequestId:
          typeof body.id === 'string'
            ? body.id
            : (result.response.headers.get('x-request-id') ?? 'openrouter-unreported'),
        rawBody,
        usage: {
          inputTokens: numberOrZero(body.usage?.prompt_tokens),
          outputTokens: numberOrZero(body.usage?.completion_tokens),
          providerReportedCostMicroIdr: null,
        },
      };
    },
  };
}

export function createGeminiProvider(options: HttpAdapterOptions): ProviderPort {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    async executeSingleAttempt(request: SingleAttemptRequest): Promise<SingleAttemptResponse> {
      assertModelPolicy({ providerId: 'gemini', dataClass: request.dataClass });
      const model = encodeURIComponent(request.requestedModelId);
      const result = await requestJson(
        fetchImpl,
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': options.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
            generationConfig: request.structuredOutput
              ? { responseMimeType: 'application/json' }
              : {},
          }),
        },
        request.timeoutMs,
      );
      const body = result.json as {
        responseId?: unknown;
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
        usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
      };
      const rawBody = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof rawBody !== 'string') throw new ProviderRefusalError(null);
      return {
        providerRequestId:
          typeof body.responseId === 'string'
            ? body.responseId
            : (result.response.headers.get('x-request-id') ?? 'gemini-unreported'),
        rawBody,
        usage: {
          inputTokens: numberOrZero(body.usageMetadata?.promptTokenCount),
          outputTokens: numberOrZero(body.usageMetadata?.candidatesTokenCount),
          providerReportedCostMicroIdr: null,
        },
      };
    },
  };
}
