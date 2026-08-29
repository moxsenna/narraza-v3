import type { JsonObject } from './json.js';

/**
 * Provider execution boundary (S5.1, Block C).
 *
 * THE critical invariant: one `executeSingleAttempt` = exactly ONE provider
 * call. There is no hidden fallback, no hidden retry, and no automatic second
 * model call inside an adapter. Judge, structured repair, judge-output repair
 * and parse repair are SEPARATE attempts orchestrated by the application.
 *
 * `executeSingleAttempt` is synchronous-with-respect-to-the-network only: it
 * never touches the database, the ledger, or artifact storage (ai-boundary).
 */

/** Data class of the packet feeding this attempt (drives model policy). */
export type AttemptDataClass =
  'writer_safe' | 'review_safe' | 'author_private' | 'service_restricted';

export interface SingleAttemptRequest {
  readonly providerId: string;
  readonly requestedModelId: string;
  readonly structuredOutput: boolean;
  readonly timeoutMs: number;
  /** Data class of the source packet; restricted classes require an allowlisted provider. */
  readonly dataClass: AttemptDataClass;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  /**
   * Mock-only fault-injection selector. Real adapters MUST ignore this field;
   * the deterministic mock uses it to pick a fixture.
   */
  readonly mockScenario?: string;
  /** Opaque tracing metadata; never hashed into the plan, never logged raw. */
  readonly metadata?: JsonObject;
}

export interface SingleAttemptUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Provider-reported cost when valid; null lets the caller price from the snapshot. */
  readonly providerReportedCostMicroIdr: bigint | null;
}

export interface SingleAttemptResponse {
  readonly providerRequestId: string;
  /** Raw provider body; parsing happens OUTSIDE the adapter. */
  readonly rawBody: string;
  readonly usage: SingleAttemptUsage;
}

export interface ProviderPort {
  executeSingleAttempt(request: SingleAttemptRequest): Promise<SingleAttemptResponse>;
}
