# Model Policy (D14) — Provisional M4

Status: **PROVISIONAL** — authored in M4 Block C. The final no-training /
no-retention provider list must be reviewed and signed off by the product owner
before any real provider receives restricted context (M4/W4.4 gate; first real
provider use remains staging M7).

## Rule

Restricted context — the truth/secrets data classes `author_private` and
`service_restricted` — may only be routed to providers/endpoints on the
`restricted_allowed` allowlist below. Entry requires a written no-training and
no-retention guarantee from the provider/endpoint. The gate is enforced
fail-closed inside every provider adapter (`packages/ai/src/model-policy.ts`,
`assertModelPolicy`) at the last point before a call leaves the process.

Restricted input is **never** silently downgraded to a safer data class to
bypass the gate.

## restricted_allowed (initial, frozen)

| Provider | Endpoint / model | Basis |
| --- | --- | --- |
| `mock` | deterministic in-process mock (`mock/narra-writer-v1`, `mock/narra-judge-v1`) | No external transmission is possible; data never leaves the process. |

Nothing else is allowlisted. Real OpenRouter/Gemini models are **not**
restricted_allowed yet; until sign-off, restricted workflows run on the mock
provider only. Non-restricted classes (`writer_safe`, `review_safe`) are not
gated by this list.

## Violations

A routing attempt that would send restricted context to a non-allowlisted
provider throws `ModelPolicyViolation` (`code = 'model_policy_violation'`) — a
configuration error, never a runtime retry. It is enforced at two layers:

1. **Startup composition** — `apps/worker-gen/src/main.ts`
   (`assertRestrictedRoutingServiceable`) proves, before an enabled job
   processor can claim anything, that at least one configured provider is
   restricted_allowed for every restricted class the frozen workflow catalogue
   (`workflowDataClasses`/`frozenWorkflowKinds`) can route. With the initial
   allowlist mock-only and the mock forbidden in production
   (`AI_ENABLE_MOCK` guard), an enabled production processor cannot boot —
   M4 product activation stays explicitly blocked until D14 sign-off, and a
   misconfigured worker fails closed at boot instead of failing every
   restricted job one at a time at runtime.
2. **Adapter boundary** — `assertModelPolicy` runs inside every provider
   adapter (and again in the worker processor over the frozen routes) at the
   last point before a call leaves the process.

## Related invariants

- `model-policy-allowlist` (unit) — restricted packet routed only to the
  allowlist; fail-closed on everything else.
- `prompt-injection-guard` (unit) — user story content is delimited data; it
  cannot alter directives, routing, or clear deterministic blockers.
- `command-no-ai` (unit) — the web command layer never calls an LLM.
