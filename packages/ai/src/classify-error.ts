/**
 * Normalized provider error taxonomy (S5.1 `classifyError`, Block C).
 *
 * The adapter throws typed errors; `classifyProviderError` maps anything
 * thrown to a stable normalized classification the orchestrator can persist
 * and decide on. Classification never swallows the error: the caller decides
 * retry policy — an adapter never retries.
 */

export type NormalizedProviderErrorKind =
  | 'timeout'
  | 'refusal'
  | 'malformed_output'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'context_length'
  | 'unknown';

export interface NormalizedProviderError {
  readonly kind: NormalizedProviderErrorKind;
  readonly retryable: boolean;
  readonly errorCode: string;
}

export class ProviderTimeoutError extends Error {
  constructor() {
    super('provider call timed out');
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRefusalError extends Error {
  constructor(readonly providerRequestId: string | null) {
    super('provider refused the request');
    this.name = 'ProviderRefusalError';
  }
}

export class ProviderUnavailableError extends Error {
  constructor(readonly statusHint: number | null) {
    super('provider unavailable');
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderRateLimitedError extends Error {
  constructor(readonly statusHint: number | null) {
    super('provider rate limited');
    this.name = 'ProviderRateLimitedError';
  }
}

export function classifyProviderError(error: unknown): NormalizedProviderError {
  if (error instanceof ProviderTimeoutError) {
    return { kind: 'timeout', retryable: true, errorCode: 'provider_timeout' };
  }
  if (error instanceof ProviderRefusalError) {
    return { kind: 'refusal', retryable: false, errorCode: 'provider_refusal' };
  }
  if (error instanceof ProviderRateLimitedError) {
    return { kind: 'rate_limited', retryable: true, errorCode: 'provider_rate_limited' };
  }
  if (error instanceof ProviderUnavailableError) {
    return { kind: 'provider_unavailable', retryable: true, errorCode: 'provider_unavailable' };
  }
  const name = error instanceof Error ? error.name : '';
  // Abort-like cancellations from the caller surface as timeouts: the provider
  // call did not complete, so usage is uncertain.
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { kind: 'timeout', retryable: true, errorCode: 'provider_timeout' };
  }
  return { kind: 'unknown', retryable: false, errorCode: 'provider_error_unknown' };
}
