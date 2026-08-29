// @narraza/ai — provider adapter + policy package (S5). No ledger, no DB, no
// artifact storage (ai-boundary): one executeSingleAttempt = one provider
// call, orchestrated by the application layer.

export const AI_PACKAGE = '@narraza/ai' as const;

export type {
  AttemptDataClass,
  ProviderPort,
  SingleAttemptRequest,
  SingleAttemptResponse,
  SingleAttemptUsage,
} from './provider-port.js';
export {
  classifyProviderError,
  ProviderRateLimitedError,
  ProviderRefusalError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './classify-error.js';
export type { NormalizedProviderError, NormalizedProviderErrorKind } from './classify-error.js';
export { parseOutput } from './parse-output.js';
export type { ParseErrorCode, ParseOutcome } from './parse-output.js';
export {
  assertModelPolicy,
  isRestrictedAllowed,
  isRestrictedDataClass,
  ModelPolicyViolation,
  RESTRICTED_ALLOWED_PROVIDERS,
  RESTRICTED_DATA_CLASSES,
} from './model-policy.js';
export { createMockProvider, DEFAULT_MOCK_SCENARIO, type MockFixture } from './mock-provider.js';
export { PROMPT_ENVELOPE_VERSION, renderPrompt } from './prompt-envelope.js';
export type { PromptContentBlock, RenderedPrompt, RenderPromptInput } from './prompt-envelope.js';
