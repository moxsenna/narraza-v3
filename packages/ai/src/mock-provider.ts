import { createHash } from 'node:crypto';
import type { ProviderPort, SingleAttemptRequest, SingleAttemptResponse } from './provider-port.js';
import { ProviderRefusalError, ProviderTimeoutError } from './classify-error.js';

/**
 * Deterministic mock provider (W4.1, Block C).
 *
 * No network, no clock, no randomness: the response is a pure function of the
 * fixture selected for the request. Fixtures are injected by the composition
 * site (tests, dev worker), keyed by an explicit scenario; the default
 * scenario echoes a canonical structured body. Fault injection covers the
 * authoritative matrix: timeout, refusal, malformed JSON, partial/truncated
 * response — all deterministic and stable for unit, PG integration, worker
 * orchestration and future E2E.
 */

export interface MockFixture {
  readonly scenario: string;
  readonly body: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Optional deterministic provider-reported cost (micro-IDR). */
  readonly providerReportedCostMicroIdr?: bigint;
}

export const DEFAULT_MOCK_SCENARIO = 'success' as const;

/** Canonical default body: valid structured JSON echo of the prompt length. */
function defaultBody(request: SingleAttemptRequest): string {
  return JSON.stringify({
    echo: request.userPrompt.slice(0, 64),
    structured: request.structuredOutput,
  });
}

function deterministicRequestId(request: SingleAttemptRequest, scenario: string): string {
  const digest = createHash('sha256')
    .update(`${request.providerId}\n${request.requestedModelId}\n${scenario}\n`)
    .update(request.systemPrompt)
    .update('\n')
    .update(request.userPrompt)
    .digest('hex');
  return `mock-req-${digest.slice(0, 24)}`;
}

export function createMockProvider(fixtures: readonly MockFixture[] = []): ProviderPort {
  const byScenario = new Map(fixtures.map((fixture) => [fixture.scenario, fixture]));
  return {
    async executeSingleAttempt(request: SingleAttemptRequest): Promise<SingleAttemptResponse> {
      const scenario = request.mockScenario ?? DEFAULT_MOCK_SCENARIO;

      // Fault fixtures first: these simulate transport-level failure modes.
      if (scenario === 'timeout') throw new ProviderTimeoutError();
      if (scenario === 'refusal') throw new ProviderRefusalError(null);

      if (scenario === 'unavailable') {
        // Modeled as a thrown unknown transport error, classified downstream.
        throw new Error('mock transport exploded');
      }

      const fixture = byScenario.get(scenario);
      const body =
        fixture?.body ??
        (scenario === 'malformed'
          ? 'not-json{{'
          : scenario === 'partial'
            ? '{"echo":"trunc'
            : defaultBody(request));
      const inputTokens = fixture?.inputTokens ?? 10;
      const outputTokens = fixture?.outputTokens ?? 20;

      return {
        providerRequestId: deterministicRequestId(request, scenario),
        rawBody: body,
        usage: {
          inputTokens,
          outputTokens,
          providerReportedCostMicroIdr: fixture?.providerReportedCostMicroIdr ?? null,
        },
      };
    },
  };
}
