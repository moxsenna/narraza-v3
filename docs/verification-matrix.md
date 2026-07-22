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
| Schema inventory is exactly 48 application tables (5 M0 + 43 W1.1)             | S2/S10   | `schema-inventory`                | integration,migration |
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

When adding invariants: append row, implement test, wire CI job, then merge.
