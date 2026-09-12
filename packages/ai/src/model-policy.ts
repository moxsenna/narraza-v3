import type { AttemptDataClass } from './provider-port.js';

/**
 * Model policy (D14, Block C) — the authoritative restricted-packet gate.
 *
 * Restricted context (truth/secrets: `author_private`, `service_restricted`)
 * may only be routed to providers/endpoints on the `restricted_allowed`
 * allowlist, which requires a written no-training & no-retention guarantee.
 * The INITIAL allowlist is the deterministic mock provider ONLY — real
 * OpenRouter/Gemini models are NOT restricted_allowed until an explicit
 * future D14 sign-off (M4/W4.4 gate; see docs/model-policy.md).
 *
 * The gate FAILS CLOSED: a non-allowlisted provider can never receive
 * restricted data, and restricted input is never silently downgraded to a
 * safer-looking class. Enforcement happens inside the provider adapter, at
 * the last possible point before a call leaves the process.
 */

export const RESTRICTED_ALLOWED_PROVIDERS: ReadonlySet<string> = new Set(['mock'] as const);

export const RESTRICTED_DATA_CLASSES: ReadonlySet<AttemptDataClass> = new Set([
  'author_private',
  'service_restricted',
] as const);

export function isRestrictedDataClass(dataClass: AttemptDataClass): boolean {
  return RESTRICTED_DATA_CLASSES.has(dataClass);
}

export function isRestrictedAllowed(providerId: string): boolean {
  return RESTRICTED_ALLOWED_PROVIDERS.has(providerId);
}

export class ModelPolicyViolation extends Error {
  readonly code = 'model_policy_violation' as const;
  constructor(
    readonly providerId: string,
    readonly dataClass: AttemptDataClass,
  ) {
    super(
      `model policy: provider '${providerId}' is not restricted_allowed for data class '${dataClass}' (D14)`,
    );
    this.name = 'ModelPolicyViolation';
  }
}

/** Fail-closed gate applied inside every provider adapter before one call. */
export function assertModelPolicy(request: {
  readonly providerId: string;
  readonly dataClass: AttemptDataClass;
}): void {
  if (isRestrictedDataClass(request.dataClass) && !isRestrictedAllowed(request.providerId)) {
    throw new ModelPolicyViolation(request.providerId, request.dataClass);
  }
}
