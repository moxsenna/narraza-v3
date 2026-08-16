# Task 3 Delta Report — PM Re-Review Cycle 2

Scope: fixes for the six findings in the PM re-review of commit `e4dca0e`.
All changes stay within Task 3; no Task 4 work, no credit APIs, no PR opened.

## Finding 1 — Trigger SQL (CRITICAL)

`pg_event_type` was not a valid row-trigger variable reference. Both immutability
functions now raise a fixed exception with an explicit ERRCODE:

```sql
RAISE EXCEPTION 'credit_ledger entries are immutable' USING ERRCODE = 'P2034';
```

Real UPDATE and DELETE mutations are executed against PostgreSQL 16 in
`credit-engine-v1.integration.test.ts` and rejected with SQLSTATE `P2034`
(4 ledger tests + 2 allocation trigger tests, all executed, all green).

## Finding 2 — Fixtures could not reach their assertions (CRITICAL)

Three fixture bugs were fixed:

1. **`job_id = NULL`** — every `credit_billing_allocations` INSERT now seeds a
   real `generation_jobs` row first (`seedBillingFixture`) and references its id.
2. **18-column `generation_jobs` INSERTs** — earlier fixtures supplied 17 values
   for 18 columns (SQLSTATE 42601). All job INSERTs now provide every column in
   one shared `JOB_COLUMNS` template with `available_at = now()`.
3. **Double seeding** — `seedReservationWithQuote()` and `seedJobInBundle()` each
   internally re-ran `seedPlanAndQuote()`, colliding on fixed IDs (`users_pkey`
   duplicates). Seeding was restructured: `seedPlanGraph` / `seedQuoteAndReservation`
   / job insert are separate, and `seedBillingFixture()` composes them exactly once.

Additional corrections surfaced by executing the tests:

- Unique violations assert SQLSTATE **23505** (not 23507 — that is exclusion violation).
- `pg` returns BIGINT as string; assertions cast via `::text` and compare strings.
- `credit_quotes.workflow_plan_project_id` was seeded with a plan id where the
  composite FK expects the project id.

## Finding 3 — §3.4 financial-evidence constraints (IMPORTANT)

The migration now enforces the full ratified contract on
`credit_billing_allocations`:

- `billing_policy_payload JSONB NOT NULL` with `jsonb_typeof(...) = 'object'`
- `system_subsidy_micro_idr = GREATEST(provider - user, 0)` (conservation law)
- `provider_cost >= 0`, `user_settlement >= 0`, `billing_policy_version > 0`

A dedicated test proves the GREATEST floor: settlement above provider cost
inserts with subsidy 0 and reads back `0`. Four negative cases (negative cost,
string payload, wrong subsidy, zero version) all fail with 23514.

## Finding 4 — Prisma/SQL parity and drift (IMPORTANT)

`prisma migrate diff --from-migrations --to-schema --exit-code` initially
reported 8 divergences; after fixes it reports **"No difference detected" (exit 0)**.

- Removed the unratified `@@unique([projectId, contributingAttemptIdsHash])`;
  `dedupe_key` remains the only allocation unique key (UNIQUE in both layers).
- `billingPolicyPayload` is `Json` (non-nullable) — `@db.Jsonb` is not a valid
  native type attribute for the postgres connector in Prisma 7.9.
- Reservation→quote relation corrected: FK lives on `CreditReservation.quote`
  (`credit_reservations_quote_id_fkey`), inverse list on `CreditQuote.reservations`
  with relation name `QuoteReservations`. `@@unique([quoteId])` retained.
- `confirmation_request_id`: partial unique index replaced with a global nullable
  UNIQUE `credit_reservations_confirmation_request_id_key` (NULLs are distinct),
  matching `@@unique([confirmationRequestId])` and the PM guidance to prefer
  global nullable UNIQUE.
- `credit_quotes` composite `UNIQUE (user_id, request_id)` added
  (`credit_quotes_user_id_request_id_key`) to satisfy the schema's
  `@@unique([userId, requestId])`.
- FK referential actions aligned with Prisma defaults: `ON UPDATE CASCADE`
  everywhere; `ON DELETE RESTRICT` for allocation FKs, `SET NULL` for quote FK.
  Job FK name pinned via `map: "credit_billing_allocations_job_id_fkey"`.
- Index names aligned with Prisma conventions:
  `credit_billing_allocations_project_id_reservation_id_usable_idx`,
  `credit_billing_allocations_contributing_attempt_ids_hash_idx`.
- `user_settlement_micro_idr` lost its unratified `DEFAULT 0`; `created_at`
  uses `TIMESTAMPTZ(3)`; the redundant non-unique `quote_id_idx` was dropped.

## Finding 5 — Retention semantics (IMPORTANT)

The previous test claimed "evidence survives purge" while only proving the
DELETE was blocked. The test now states what the ratified §3.4 strategy actually
guarantees: a project purge is **refused** (SQLSTATE 23503 via RESTRICT FKs)
while allocation evidence exists, and the evidence rows are then read back
intact (cost 1000 / subsidy 200). Retention is delivered by refusal, not by
orphaning evidence — weakening purge or nullable-izing `project_id` was not
ratified and was not done.

## Finding 6 — Upgrade evidence (IMPORTANT)

`runUpgrade()` in `test-migrations.mjs` now seeds representative pre-W3.3 data
(a `reservation_release` ledger row), snapshots it, applies
`CREDIT_ENGINE_V1`, verifies the exact migration history
(`FINAL_MIGRATIONS` including `20260816094500_credit_engine_v1`), and confirms
the ledger row survives byte-for-byte alongside the M0 state checks.
`test-migrations.test.mjs` asserts the exact ordered history including the new
migration id.

## Vocabulary

No `charge` anywhere in new W3.3 tests; the ledger INSERT test uses `grant`,
the trigger test uses `adjustment`.

## Fresh verification (PostgreSQL 16.14 via Testcontainers)

| Check | Result |
| --- | --- |
| `prisma generate` | ok (7.9.0) |
| `credit-engine-v1.integration.test.ts` | 16/16 passed |
| `scripts/test-migrations.test.mjs` | 6/6 passed |
| `migration:empty` | PASS — 49 tables (5 M0 + 43 W1.1 + 1 W3.3) |
| `migration:upgrade` | PASS — M0 rows/enums/indexes preserved, 49 tables |
| `migration:all` | PASS (expand-only + empty + upgrade) |
| `prisma migrate diff --from-migrations --to-schema --exit-code` | exit 0, "No difference detected" |
| `lint` (eslint) | clean |
| `typecheck` (tsc --build) | clean |
| `prettier --check` changed files | clean |

Full-suite results are reported in the completion message alongside HEAD.
