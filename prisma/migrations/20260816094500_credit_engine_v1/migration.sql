-- Migration ID: 20260816094500_credit_engine_v1
-- UTC date: 2026-08-16 09:45:00Z
-- Purpose: Credit Engine Phase 1 - quote confirmation linkage, billing allocation, append-only enforcement
-- Classification: forward-fix; additive changes only (no breaking alterations)
-- Prerequisite: 20260728230906_credit_ledger_release_vocabulary

BEGIN;

--------------------------------------------------------------------------------
-- STEP 1: Add quote_id to credit_reservations
--------------------------------------------------------------------------------
-- Rationale: Quote confirmation creates canonical link between quote and reservation
-- Adds FK from reservation to quote; makes quote unconsumable after binding
ALTER TABLE "credit_reservations"
ADD COLUMN "quote_id" TEXT;

ALTER TABLE "credit_reservations"
ADD CONSTRAINT "credit_reservations_quote_id_key" UNIQUE ("quote_id");

ALTER TABLE "credit_reservations"
ADD CONSTRAINT "credit_reservations_quote_id_fkey"
FOREIGN KEY ("quote_id") REFERENCES "credit_quotes"("id") ON UPDATE NO ACTION ON DELETE SET NULL;

CREATE INDEX "credit_reservations_quote_id_idx" ON "credit_reservations" ("quote_id");

--------------------------------------------------------------------------------
-- STEP 2: Add confirmation_request_id to credit_reservations
--------------------------------------------------------------------------------
-- Rationale: Idempotency key for quote → reservation transition; enables retries
-- Partial global unique index ensures one reservation per confirmation_request_id
ALTER TABLE "credit_reservations"
ADD COLUMN "confirmation_request_id" TEXT;

CREATE UNIQUE INDEX "credit_reservations_confirmation_request_id_partial"
ON "credit_reservations" ("confirmation_request_id")
WHERE "confirmation_request_id" IS NOT NULL;

--------------------------------------------------------------------------------
-- STEP 3: Create credit_billing_allocations table (immutable billing record)
--------------------------------------------------------------------------------
-- Rationale: Append-only ledger of user-facing billing allocations per usable output
-- Enforces integrity at DB level via trigger; cannot UPDATE or DELETE rows
-- Preserves full financial evidence with retention-safe FK constraints (no cascade)
CREATE TABLE "credit_billing_allocations" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "reservation_id" TEXT NOT NULL,
  "usable_output_kind" TEXT NOT NULL,
  "usable_output_ref" TEXT NOT NULL,
  "contributing_attempt_ids_hash" TEXT NOT NULL,
  "provider_cost_micro_idr" BIGINT NOT NULL CHECK ("provider_cost_micro_idr" >= 0),
  "user_settlement_micro_idr" BIGINT NOT NULL DEFAULT 0 CHECK ("user_settlement_micro_idr" >= 0),
  "system_subsidy_micro_idr" BIGINT NOT NULL DEFAULT 0 CHECK ("system_subsidy_micro_idr" >= 0),
  "billing_policy_version" INTEGER NOT NULL DEFAULT 1 CHECK ("billing_policy_version" > 0),
  "billing_policy_payload" JSONB,
  "dedupe_key" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FKs use RESTRICT/NO ACTION for retention-safe billing history preservation
ALTER TABLE "credit_billing_allocations"
ADD CONSTRAINT "credit_billing_allocations_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "credit_billing_allocations"
ADD CONSTRAINT "credit_billing_allocations_job_id_fkey"
FOREIGN KEY ("project_id", "job_id") REFERENCES "generation_jobs"("project_id", "id") ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE "credit_billing_allocations"
ADD CONSTRAINT "credit_billing_allocations_reservation_id_fkey"
FOREIGN KEY ("reservation_id") REFERENCES "credit_reservations"("id") ON UPDATE NO ACTION ON DELETE RESTRICT;

-- Unique dedupe key for allocation insertion idempotency
-- Compound index for fast lookup by project + reservation + output during settlement
CREATE INDEX "credit_billing_allocations_project_output_idx"
ON "credit_billing_allocations" ("project_id", "reservation_id", "usable_output_kind", "usable_output_ref");

-- Index for attempt-based analysis if needed
CREATE INDEX "credit_billing_allocations_contribution_hash_idx"
ON "credit_billing_allocations" ("contributing_attempt_ids_hash");

--------------------------------------------------------------------------------
-- STEP 4: CreditLedger append-only trigger (reject mutations)
--------------------------------------------------------------------------------
-- Rationale: Ledger entries are immutable evidence; mutation attempts fail early
CREATE OR REPLACE FUNCTION "fn_credit_ledger_enforce_immutability" ()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger entries are immutable: %', pg_event_type USING ERRCODE = 'P2034';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "credit_ledger_immutable" ON "credit_ledger";

CREATE TRIGGER "credit_ledger_immutable"
BEFORE UPDATE OR DELETE ON "credit_ledger"
FOR EACH ROW EXECUTE FUNCTION "fn_credit_ledger_enforce_immutability" ();

--------------------------------------------------------------------------------
-- STEP 5: BillingAllocation append-only trigger (reject mutations)
--------------------------------------------------------------------------------
-- Rationale: Allocation records are financial evidence; must never be modified
CREATE OR REPLACE FUNCTION "fn_credit_billing_allocation_enforce_immutability" ()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'credit_billing_allocations entries are immutable: %', pg_event_type USING ERRCODE = 'P2034';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "billing_allocation_immutable" ON "credit_billing_allocations";

CREATE TRIGGER "billing_allocation_immutable"
BEFORE UPDATE OR DELETE ON "credit_billing_allocations"
FOR EACH ROW EXECUTE FUNCTION "fn_credit_billing_allocation_enforce_immutability" ();

--------------------------------------------------------------------------------
-- STEP 6: GenerationJob workflow_plan_id → bundle_id CHECK constraint
--------------------------------------------------------------------------------
-- Rationale: Semantic guardrail — if a job references a workflow plan, it must
-- have an upstream context bundle; prevents orphaned plan references
ALTER TABLE "generation_jobs"
ADD CONSTRAINT "generation_jobs_workflow_plan_requires_bundle_check"
CHECK ("workflow_plan_id" IS NULL OR "bundle_id" IS NOT NULL);

COMMIT;
