# Narraza v3 — Verification Matrix

Living document. Update when invariants, migrations, prompt contracts, or state machines change. Merge only if CI green for mapped tests.

CI job identifiers (stable):

```
lint-typecheck
unit
integration
contract
e2e
architecture
migration
deploy-test
security-smoke
```

Multiple jobs for one invariant: use comma-separated list (e.g. `contract,e2e`). Do not use the generic label `CI`.

| Invariant                                                                       | Source   | Test target                       | CI job              |
| ------------------------------------------------------------------------------- | -------- | --------------------------------- | ------------------- |
| Writer packet does not carry restricted truth fields/ids                        | S3       | `writer-packet-leak`              | unit                |
| Writer guidance never embeds raw forbidden truth phrases                        | S3       | `writer-guidance-safe`            | unit                |
| Non-POV gets behavioral directives not raw beliefs                              | S3       | `expression-policy`               | unit                |
| Belief downgrade without allowed reason rejected                                | S3       | `belief-transition`               | unit                |
| Dependency hash stable under key reordering                                     | S3       | `dependency-hash`                 | unit                |
| Deterministic findings cannot be removed by AI findings                         | S3       | `merge-findings`                  | unit                |
| Repair loop stops on no-progress / repeated findings                            | S3       | `repair-policy`                   | unit                |
| Disclosure fold + retraction target                                             | S3       | `disclosure-fold`                 | unit                |
| Unrelated global canonical version bump does not invalidate proposal            | S2/S3/S4 | `proposal-unrelated-version-bump` | integration         |
| Fact only exists after applied change set                                       | S2       | `fact-lifecycle`                  | integration         |
| Project canonical version +1 per change set                                     | S2/S4    | `accept-proposal`                 | integration         |
| Prose composite FK accepted pointer belongs to beat                             | S2       | `prose-fk`                        | integration         |
| Partial unique soft-delete facts                                                | S2       | `soft-delete-unique`              | integration         |
| Accept CAS fail → proposal stale in new tx                                      | S4       | `accept-cas-stale`                | integration         |
| Sibling proposals superseded in same accept tx                                  | S4       | `accept-supersede`                | integration         |
| Web never calls LLM                                                             | S4       | `command-no-ai`                   | unit                |
| Snapshot + AIWorkflowPlan frozen before CreditQuote                             | S4/S5/S9 | `request-beat-snapshot`           | integration         |
| CreditQuote references exact workflow plan used by job                          | S5/S9    | `credit-quote-plan-binding`       | integration         |
| Lease fence blocks zombie Tx C publish                                          | S8       | `lease-fence-publish`             | integration         |
| Job terminal immutable                                                          | S8       | `job-terminal`                    | integration         |
| running→queued execution retry fenced                                           | S8       | `exec-retry`                      | integration         |
| Terminal + unknown attempt → reservation closing                                | S8       | `reservation-exposure`            | integration         |
| WorkflowInvocation single winner CAS                                            | S8       | `invocation-winner`               | integration         |
| Late attempt costs recorded, not selected                                       | S8       | `late-attempt`                    | integration         |
| Outbox handler idempotent double delivery                                       | S8       | `outbox-idempotent`               | integration         |
| Outbox retry after external side effect uses same dedupe key                    | S8       | `outbox-uncertain-delivery`       | integration         |
| Dead outbox replay creates new delivery generation, not new event               | S8       | `outbox-replay-generation`        | integration         |
| Claim is globally oldest-first across fresh and expired reclaim work; attemptCount fences stale finalize | S8.4/D9 | `outbox-claim-fence` | integration |
| Outbox consumer runs independent of `JOB_PROCESSOR_ENABLED`; empty registry idles; embedded and standalone compose one module | D11/D12 | `outbox-worker-wiring` | unit |
| Outbox handler idempotent double delivery                                       | S8       | `outbox-idempotent`               | integration         |
| Outbox retry after external side effect uses same dedupe key                    | S8       | `outbox-uncertain-delivery`       | integration         |
| Dead outbox replay creates new delivery generation, not new event               | S8       | `outbox-replay-generation`        | integration         |
| Cancel queued releases slot + reservation                                       | S8       | `cancel-queued`                   | integration         |
| Manual retry creates new job                                                    | S8       | `retry-new-job`                   | integration         |
| Active user required                                                            | S6       | `active-user-guard`               | unit                |
| Register + email verify two-step atomic consume                                 | S6/D21   | `auth-register-verify`            | e2e                 |
| Password login: correct/wrong credential, unverified account blocked            | S6/D21   | `auth-login`                      | integration,e2e     |
| Login brute-force lockout (max attempts/identifier + per-IP)                    | D21      | `login-lockout`                   | integration         |
| Password reset: atomic consume, revokes all prior sessions                      | S6/D21   | `auth-password-reset`             | e2e                 |
| Email token DoS policy (max 3 active per user+purpose)                          | S6/D21   | `email-token-cap`                 | integration         |
| Idle session 14d; activity update max once per 6h                               | S6       | `session-idle-policy`             | integration         |
| Tombstone mid provider call records cost, does not publish proposal             | S6/S8    | `tombstone-mid-attempt`           | integration         |
| IDOR → NOT_FOUND                                                                | S6       | `idor`                            | e2e                 |
| service_restricted never in client JSON                                         | S6/S9    | `proposal-dto`                    | contract,e2e        |
| Web process env has no AI keys                                                  | S6/S10   | `env-boundary`                    | unit,security-smoke |
| Model cannot deserialize as CanonicalChangeOperation                            | S7       | `op-type-boundary`                | unit                |
| tempRef resolved before proposal persist                                        | S7       | `tempref-resolve`                 | unit                |
| Beat contract cannot emit outline/foundation ops                                | S7       | `op-allowlist`                    | unit                |
| ProseAcceptOperation always last in beat operation DAG                          | S7       | `prose-accept-order`              | unit                |
| Proposal with mismatched operationsHash rejected                                | S7       | `proposal-operation-hash`         | integration         |
| Repair full re-extraction                                                       | S7       | `repair-reextract`                | unit                |
| Publish accept does not bump canon version                                      | S7       | `publish-artifact`                | integration         |
| Outline update blocked with accepted prose                                      | S7       | `outline-downstream`              | integration         |
| Concept accept → foundation draft not locked                                    | S7       | `concept-accept`                  | integration         |
| CreditQuote one-time consume                                                    | S9       | `credit-quote`                    | integration         |
| Working draft CAS conflict                                                      | S9       | `working-draft`                   | integration         |
| Validation stale after content hash change                                      | S9       | `validation-hash`                 | integration         |
| User-edited prose Proposal source=user                                          | S9       | `user-proposal`                   | integration         |
| Active job recovered after refresh                                              | S9       | `job-recovery`                    | e2e                 |
| Progress reducer shared dashboard/redirect                                      | S9       | `progress-view`                   | unit                |
| No raw ops in PublicProposalView                                                | S9       | `proposal-dto`                    | contract            |
| Override only server-listed findings                                            | S9       | `override-allowlist`              | integration         |
| Architecture: web no Prisma                                                     | S1/S10   | `web-boundary`                    | architecture        |
| Architecture: core no db/ai/next                                                | S1/S10   | `core-boundary`                   | architecture        |
| Architecture: application ports only                                            | S1/S10   | `application-boundary`            | architecture        |
| Architecture: ai no ledger/storage                                              | S1/S10   | `ai-boundary`                     | architecture        |
| Architecture: worker adapters no domain logic                                   | S1/S10   | `worker-boundary`                 | architecture        |
| Schema inventory is exactly 49 application tables (5 M0 + 43 W1.1 + 1 W3.3)    | S2/S10   | `schema-inventory`                | integration,migration |
| W1.1 migrations are ordered, metadata-complete, and expand-only                | S10      | `expand-only`                     | migration           |
| Composite tenant FKs reject cross-project references with SQLSTATE 23503       | S2       | `planning-tenant-fk`              | integration         |
| Named schema CHECK constraints reject invalid values with SQLSTATE 23514       | S2       | `schema-check-sqlstate`           | integration         |
| Project purge removes content while retaining ledger/audit/outbox evidence     | S2/S10   | `schema-retention`                | integration         |
| Migrate empty DB                                                                | S10      | `migrate-empty`                   | migration           |
| Migrate N-1 fixture                                                             | S10      | `migrate-upgrade`                 | migration           |
| Schema drift fails CI                                                           | S10      | `prisma-migrate-diff`             | migration           |
| Single migration runner lock prevents parallel migrate                          | S10      | `migration-runner-lock`           | deploy-test         |
| Readiness fails if migration version not applied                                | S10      | `readiness-migration-version`     | deploy-test         |
| Release checksum mismatch aborts deploy                                         | S10      | `deploy-checksum`                 | deploy-test         |
| Vertical slice guided                                                           | S10      | `vertical-slice`                  | e2e                 |
| Foundation lock requires confirm                                                | S9       | `foundation-lock`                 | e2e                 |
| No internal leak strings in DOM                                                 | S9       | `no-internal-strings`             | e2e,security-smoke  |
| Credit header equals settings snapshot                                          | S9       | `credit-summary`                  | e2e                 |
| Failed job without usable output → zero user charge (full release)              | D4       | `failed-job-zero-charge`          | integration         |
| Foundation readiness deterministic from weighted checklist                      | D5       | `foundation-readiness`            | unit                |
| Credit display rounding: floor available, ceil held/quote; single conversion fn | D6       | `credit-rounding`                 | unit                |
| Email token rate limit (cooldown + per-identifier + per-IP, per purpose)        | D10/D21  | `email-token-rate-limit`          | integration         |
| Adversarial prose cannot alter directives or clear deterministic blockers       | D13      | `prompt-injection-guard`          | unit                |
| Restricted packet routed only to model-policy allowlist                         | D14      | `model-policy-allowlist`          | unit                |
| Vertical slice guided at 375px viewport                                         | D20      | `vertical-slice-mobile`           | e2e                 |
| Narrative chronology uses sequence before stable chapter and beat tie-breakers  | S3       | `narrative-position`              | unit                |
| Reveal guidance exposes safe directives without restricted truth                | S3       | `reveal-policy`                   | unit                |
| Canonical JSON and SHA-256 remain stable under key reordering                    | S3       | `canonical-json`                  | unit                |
| Dependency status fails closed for malformed or stale manifests                 | S3       | `stale-policy`                    | unit                |
| Accepted prose and validation bindings obey immutable pointer policy             | S3       | `prose-policy`                    | unit                |
| Context packet runtime boundaries reject unknown keys, duplicate IDs, and kind/class mismatch | S3 | `packet-builders` | unit |
| Repair packet rejects unsanitized/internal validation finding | S3 | `repair-packet` | unit |
| Extraction use case has fixed data class and rejects mismatch | S3 | `extraction-packet` | unit |
| Restricted projections are not assignable to writer/repair fields at compile time | S3 | `packet-type-boundary` | unit |
| Finding identity excludes source/severity and uses canonical location/evidence | S3 | `finding-identity` | unit |
| Structural validator emits semantic review instead of unprovable blocker | S3 | `structural-validator` | unit |
| Restricted matcher is Unicode-normalized and token-boundary safe | S3 | `restricted-matcher` | unit |
| Public validation findings never carry source/evidence/restricted detail | S3/D13 | `to-public-finding` | unit,security-smoke |
| Ledger append-only with dedupe-key arbiter; conservation R=S+L+E monotone under reconciliation | S2.6/D4 | `ledger-reconciliation` | integration |
| Usable-output settlement commits Tx P atomically; allocation replay byte-identical, divergent tuple rejected | D4 | `usable-output-settlement` | integration |
| Retention deletes only stale unused quotes/bundles older than 24h; snapshots/audit/outbox evidence survive | D12 | `credit-retention` | integration |
| Production quote confirmation serializes against concurrent production retention sweep (both interleavings) | D12/S9 | `credit-retention-confirmation-race` | integration |
| Nonlegacy terminal job without reservation fails closed financially with one durable typed incident; pre_d4_legacy exempt | D4/S8 | `missing-reservation-incident` | integration |
| Fenced publish preflight rejects unbounded would-be-success before callback/classifier/settlement | D4/S8 | `lease-fence-publish` | integration |
| Production product surface never offers the M3 mock generation capability: no quote, reservation, or job can be created from the placeholder plan path; `chapter.write.compose` stays PRESENTATION until M4 owns real generation | S9/D4 | `generation-truthful` | unit,e2e |
| The M3 mock vertical is exposed only through a fail-closed harness boundary (production/staging/unknown → non-enumerating 404; authenticated owner-scoped chapter context required); the same production W3.5 components call the REAL M3 services there | S9 | `generation-harness` | unit,e2e |
| Quote confirmation is exactly idempotent: reservation/job ids derive deterministically (namespaced SHA-1 UUIDv5) from the server-issued quote id, so a repeated or concurrent confirm of the same quote yields `exact_replay` semantics with one reservation and one job — Task 6 is not weakened | Task 6/D4 | `confirm-replay` | integration,e2e |
| Terminal outcome recovery is scoped per chapter: payload eligibility filters before ordering/limit, so a newer terminal job from another chapter (or kind) never hides an older chapter's truthful outcome | D12/S8 | `terminal-recovery` | integration,e2e |
| Credit page and header chip render one server-derived `CreditSummaryView` snapshot; conversion to credits happens only in the application layer, never re-applied in web | D6/S9 | `credit-summary-view` | unit,e2e |
| Public job phases only (`queued|running|succeeded|failed|dead|cancelled`); no fabricated percentages or fabricated terminal states | D12 | `job-public-phase` | unit |
| UI polling starts at 2.5s with ×1.5 backoff capped at 10s; transient read failures stay recoverable and never map to terminal phases | D12 | `job-poll-backoff` | unit |
| Active job recovers across refresh with server-derived banner; more than one active scene job fails closed (`ambiguous`), never `jobs[0]` selection | D12/S8 | `job-recovery` | e2e |
| Queued cancel and failed-without-usable-output release held credits with zero user charge through real reconciliation | D4 | `m3-cancel-zero-charge` | e2e,integration |
| Confirm form tampering (foreign projectId) fails closed as NOT_FOUND without side effects | S9 | `confirm-tamper` | e2e |
| Hard worker process death → lease expiry → reclaim sweep → new ownership with advanced fence → stale fence cannot publish → no duplicate publish → credit conserved | S8/D4 | `process-crash-reclaim` | local evidence (not CI-wired) |

| Operation DAG order and cycle members are stable across input permutations | S3 | `operation-topo-sort` | unit |
| Canonical operations hash covers semantic material and is permutation-stable | S3 | `operations-hash` | unit |

When adding invariants: append row, implement test, wire CI job, then merge.

## W3.5 UI mechanics — corrected architecture

Two separated concerns (PM corrective review):

1. **Production W3.5 mechanics components** — `CreditQuoteCard`, `JobPhasePanel`,
   polling, cancel, `CreditSummaryView` surfaces — are real production
   components. The production product path (`/tulis`) does NOT offer generation:
   `chapter.write.compose` stays PRESENTATION and the page renders the honest
   unavailable state. M4 owns activation of real AI generation
   (AIWorkflowPlan, pricing, JobProcessor).
2. **M3 mock vertical harness** — a fail-closed surface in the approved preview
   tree (`/app/__preview/m3-generation/[projectId]/[chapterId]`) that renders the
   same production components against the REAL M3 quote/confirm/job services so
   the E2E mock driver can prove the full vertical. The boundary
   (`lib/server/preview/generation-harness.ts`) refuses production/staging/unknown
   outright and always requires authenticated owner-scoped chapter access; the
   three mutating server actions (quote request, confirm, cancel) re-derive the
   same fail-closed decision server-side, so a leaked action id cannot mutate in
   production.

`unit` targets run in `apps/web` Vitest (or package unit suites); `e2e` targets
run in Playwright against both the `desktop` (1280×800) and `mobile`
(375×812) projects with the real Next.js server, real PostgreSQL (E2E
container), Mailpit, and real M3 job/credit services. `process-crash-reclaim`
is a standalone cross-platform evidence harness
(`tests/evidence/process-crash-reclaim.mjs` + worker child
`tests/evidence/process-crash-reclaim-worker.mjs`); it deliberately uses only
the Node child-process API (`kill('SIGKILL')` = `TerminateProcess` on Windows,
SIGKILL on POSIX) so it can run in any CI, but it is run as local evidence and
is not wired into the required CI set.

| Test target             | File                                                                                                   | Blocks                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `generation-truthful`   | `apps/web/src/lib/frontend/capabilities.ts`, `apps/web/src/app/w3-5.contract.test.ts`, `tests/e2e/job-recovery.spec.ts` (production fail-closed) | `generation-truthful` |
| `generation-harness`    | `apps/web/src/lib/server/preview/generation-harness.ts`, `apps/web/src/app/(preview)/app/%5F_preview/m3-generation/[projectId]/[chapterId]/page.tsx`, `apps/web/src/server/domain/generation-actions.ts` | `generation-harness` |
| `confirm-replay`        | `apps/web/src/lib/server/confirmation-identity.ts` (+test), `packages/db/src/schema-test/credit-quote.integration.test.ts` (exact replay + concurrent convergence), `tests/e2e/job-recovery.spec.ts` (real double confirm) | `confirm-replay` |
| `terminal-recovery`     | `packages/db/src/job/job-terminal-lookup.integration.test.ts`, `tests/e2e/job-recovery.spec.ts` (multi-chapter refresh) | `terminal-recovery` |
| `credit-summary-view`   | `apps/web/src/lib/frontend/credit-display.test.ts`, `apps/web/src/lib/server/credit-view-model.ts`, `tests/e2e/credit-summary.spec.ts` | `credit-summary-view` |
| `job-public-phase`      | `apps/web/src/lib/frontend/job-phase.test.ts`                                                          | `job-public-phase`                            |
| `job-poll-backoff`      | `apps/web/src/components/credits/JobPhasePanel.tsx`, `apps/web/src/app/w3-5.contract.test.ts`          | `job-poll-backoff`                            |
| `job-recovery`          | `tests/e2e/job-recovery.spec.ts`                                                                       | `job-recovery`                                |
| `m3-cancel-zero-charge` | `tests/e2e/m3-cancel-zero-charge.spec.ts`, `packages/db/src/job/failed-job-zero-charge.integration.test.ts` | `m3-cancel-zero-charge`                   |
| `confirm-tamper`        | `tests/e2e/m3-cancel-zero-charge.spec.ts`                                                              | `confirm-tamper`                              |
| `process-crash-reclaim` | `tests/evidence/process-crash-reclaim.mjs`                                                             | `process-crash-reclaim`                       |

Backend surface added for W3.5 is read-only and narrow: `JobPort.findLatestTerminalByProject`
(immutable terminal lookup with payload-scoped eligibility applied before
ordering/limit), `CreditReservationPort.findByJob` (reservation evidence for
terminal jobs), and public exports of the approved D6 rounding helpers
(`MICRO_IDR_PER_CREDIT`, `microIdrToCreditsFloor`, `microIdrToCreditsCeil`).
No schema, migration, state-machine, reservation, outbox, or AI changes.

## W3.4 outbox delivery — test target locations

The five W3.4 targets above resolve to these files. `integration` targets run
against real PostgreSQL (Testcontainers, `packages/db/vitest.schema.config.ts`);
`unit` targets run in the package's default Vitest project.

| Test target                 | File                                                                      | Blocks                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `outbox-idempotent`         | `packages/db/src/outbox/outbox-idempotent.integration.test.ts`            | `outbox-idempotent`                                                                                      |
| `outbox-uncertain-delivery` | `packages/db/src/outbox/outbox-uncertain-delivery.integration.test.ts`    | `outbox-uncertain-delivery`, `outbox-terminal-never-redelivered`                                         |
| `outbox-replay-generation`  | `packages/db/src/outbox/outbox-replay-generation.integration.test.ts`     | `outbox-replay-generation`, `outbox-replay-concurrency`                                                  |
| `outbox-claim-fence`        | `packages/db/src/outbox/outbox-idempotent.integration.test.ts`            | `outbox-claim-fence`, `outbox-claim-mixed-order`, `outbox-claim-mixed-concurrency`, `outbox-claim-selection`, `outbox-finalize-guards` |
| `outbox-worker-wiring`      | `apps/worker-gen/src/main.test.ts`, `apps/worker-outbox/src/main.test.ts`  | `outbox-worker-wiring (embedded, D11)`, `outbox-worker-wiring (standalone, D11)`                          |

Application-level contract coverage (registry, handler-outside-transaction
ordering, idempotency key stability, loop cadence and shutdown) lives in
`packages/application/src/outbox/outbox-delivery-service.test.ts` and
`packages/application/src/outbox/outbox-consumer-loop.test.ts`, both in `unit`.

## M4 system-funded AI workflows — test target locations

Block D wires the eight authoritative workflow kinds
(`chat_intake_reply`, `concept_generation`, `foundation_generation`,
`character_generation`, `outline_generation`, `beat_write_judge`,
`safe_repair`, `publish_package`) through system-funded intake, the attempt
orchestrator, and fenced Tx C projection. `integration` targets run against
real PostgreSQL (Testcontainers, `packages/db/vitest.schema.config.ts`); `unit`
targets run in the package's default Vitest project.

| Test target | File | Blocks |
| --- | --- | --- |
| `system-funded-budget-path` | `packages/application/src/ai/system-funded-intake-service.test.ts`, `packages/db/src/ai/system-funded-intake.integration.test.ts` | reservation = exact frozen `estimatedMaxMicroIdr`, dedupe `system-budget:{jobId}`, stable ids pre-allocated |
| `fair-use-intake-limit` | `packages/db/src/ai/system-funded-intake.integration.test.ts` | 60/day atomic check+increment on `rate_limit_counters`, Asia/Jakarta day from the PostgreSQL clock, replay consumes no unit, attempt 61 blocked with zero mutations |
| `intake-replay-conflict` | `packages/db/src/ai/system-funded-intake.integration.test.ts` | exact replay idempotent under post-lock race; conflicting semantics fail closed |
| `orchestration-lifecycle` | `packages/db/src/ai/attempt-orchestration.integration.test.ts` | one `executeSingleAttempt` = one provider call; unusable output finalizes `failed` before Tx B; judge/repair separation; owned plan failure releases the full system-funded reservation with zero user ledger rows |
| `worker-vertical-matrix` | `packages/db/src/ai/m4-actual-worker-certification.integration.test.ts` | all 8 kinds through the actual `createM4JobProcessor`: success, malformed→separate repair, repair exhausted (zero usable output), timeout/orphan recovery under `maxInvocations`, nonretryable refusal, judge pass/reject, cancel before provider/in-flight/between stages/before repair, stale fence, terminal job, tampered frozen packet binding |
| `m4-product-projection` | `packages/db/src/ai/m4-product-projection.integration.test.ts` | per-kind product rows written in the same Tx C as the fenced publish sentinel; replay returns the recorded outcome without duplicating |
| `request-beat-snapshot` | `packages/db/src/ai/request-beat-snapshot.integration.test.ts` | bundle+plan frozen before quote; source mutation never rewrites frozen artifacts |
| `credit-quote-plan-binding` | `packages/db/src/ai/credit-quote-plan-binding.integration.test.ts` | job bound to the exact plan/bundle/hash the quote referenced; hash mismatch fails closed; replay exact |
| `model-policy-allowlist` | `packages/ai/src/http-adapters.test.ts`, `packages/ai/src/provider-mock-faults.test.ts`, `apps/worker-gen/src/main.test.ts` (D14 startup gate) | restricted classes reach only `restricted_allowed` providers; non-allowlisted routing fails closed at boot and at the adapter boundary |
| `prompt-context-security` | `packages/core/src/context/packet-builders.test.ts`, `writer-packet-leak.test.ts`, `writer-guidance-safe.test.ts`, `packages/core/src/context/packet-type-boundary.typecheck.ts`, `packages/core/src/validation/prompt-injection-guard.test.ts` | packet integrity, no guidance leak, type-boundary, injection guard |

Frozen per-stage invocation caps live in the catalogue
(`packages/application/src/ai/workflow-plan-freeze-service.ts`): judge and all
repair stages run at most once; the primary stage uses the profile cap. The
worst-case budget prices these caps against immutable snapshots
(`worstCaseBudgetMicroIdr`); the provider boundary enforces the frozen input
ceiling in UTF-8 bytes, which is conservative in the budget-relevant direction.
