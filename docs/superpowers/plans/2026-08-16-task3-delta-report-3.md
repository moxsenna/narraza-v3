# Task 3 Delta Report — PM Re-Review Cycle 3 (Final Delta)

Scope: the four items from PM re-review #3 of commit `79a5252`.
No previously-fixed Task 3 areas were reopened; no Task 4 work; no PR opened.

## 1. Retention — real purge path proven

Audited the repository's actual purge contract first: the W3.2 schema-retention
suite (`credit-validation-ops.integration.test.ts`, invariant "project purge
removes content but retains immutable evidence") performs a hard
`DELETE FROM projects` that **succeeds**, cascading story content away, while
ledger/audit/outbox rows survive — financial evidence keeps project attribution
as **retained scalars without project FKs** (the established W3.2 pattern:
`credit_reservations` and `credit_quotes` have no FK to `projects`).

My previous `RESTRICT` FKs from `credit_billing_allocations` to
`projects`/`generation_jobs` **blocked** that permitted path, so per the PM
instruction the linkage was changed to the plan-allowed retained-scalar strategy:

- `credit_billing_allocations.project_id` / `job_id` remain NOT NULL scalars
  with **no FK** — rows survive purge with attribution intact.
- `credit_billing_allocations_reservation_id_fkey` (RESTRICT) is kept:
  reservations themselves survive project purge, and the FK protects reservation
  evidence from deletion while an allocation references it.
- Prisma parity: `CreditBillingAllocation` keeps only the `reservation`
  relation; `Project`/`GenerationJob` back-relations removed.

New test `permitted project purge succeeds and billing evidence survives`
executes the real path end-to-end and proves:

- `DELETE FROM projects` **succeeds** (no error expected);
- story content is gone: projects, generation_jobs (cascade), roadmaps;
- retained evidence survives: credit_ledger, audit_events, outbox_events;
- the W3.3 billing allocation survives with `project_id`/`job_id` scalars and
  amounts intact (cost 1000 / subsidy 200);
- the reservation survives with its purged job binding cleared (`job_id NULL`).

Purge is no longer redefined as "refused".

## 2. Upgrade — representative W3.2 snapshot

`runUpgrade()` now seeds a full representative W3.2 graph on the pre-W3.3
schema before applying `CREDIT_ENGINE_V1`:

`project → context snapshot → bundle → workflow plan → generation job
→ credit quote (plan-bound) → credit reservation (job-bound)`

Exact pre-migration tuples of job/quote/reservation are captured and, after the
W3.3 deploy, asserted:

- every existing `generation_jobs` field unchanged;
- every existing `credit_quotes` field unchanged;
- every existing `credit_reservations` financial/binding field unchanged;
- the new `quote_id` / `confirmation_request_id` columns appear as NULL on the
  legacy reservation;
- ledger vocabulary migration result still intact;
- exact migration history (`FINAL_MIGRATIONS`) and 49-table inventory verified.

## 3. Unapproved quote composite unique removed

Verified against `origin/master` that `@@unique([userId, requestId])` was
introduced during Task 3, not part of W3.2. Removed from the Prisma model and
the `credit_quotes_user_id_request_id_key` DDL was removed from the W3.3
migration (step 2b now documents why no unique is added). The preexisting
partial unique `credit_quotes_request_id_key` from `20260722093000` is
untouched; old migration history unmodified. Drift re-run: **exit 0, "No
difference detected."**

## 4. DDL quality

- The inline duplicate CHECKs were removed from the
  `credit_billing_allocations` CREATE TABLE (`system_subsidy` conservation and
  `billing_policy_payload` jsonb-object). The named constraints
  `credit_billing_allocations_system_subsidy_conservation_check` and
  `credit_billing_allocations_billing_policy_payload_object_check` are the
  single source for each invariant. Non-duplicated inline CHECKs
  (`provider_cost >= 0`, `user_settlement >= 0`, `version > 0`) remain inline.
- Test renamed: `confirmation_request_id global nullable UNIQUE enforces
  uniqueness` (previously claimed "partial unique").
- Constraint-name expectations updated for the removed project/job FKs.

## Verification (PostgreSQL 16.14, Testcontainers)

| Check | Result |
| --- | --- |
| `prisma generate` | ok (7.9.0) |
| credit-engine-v1 integration | 16/16 passed (incl. new purge test) |
| `migration:empty` | PASS — 49 tables (5 M0 + 43 W1.1 + 1 W3.3) |
| `migration:upgrade` | PASS — W3.2 snapshot preserved, M0 state preserved |
| `migration:all` | PASS |
| `migrate diff --exit-code` | exit 0, "No difference detected" |
| lint / typecheck / prettier | clean |
| full db integration suite | reported in completion message |
