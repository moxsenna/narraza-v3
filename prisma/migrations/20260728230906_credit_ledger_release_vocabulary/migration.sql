-- Migration ID: 20260728230906_credit_ledger_release_vocabulary
-- UTC date: 2026-07-28 23:09:06Z
-- Workstream: W3.1
-- Purpose: Align credit ledger reservation release vocabulary with application contract.
-- Classification: focused compatibility migration
-- Prerequisite: 20260722093000_credit_validation_publish_ops_expand
-- Lock profile: ACCESS EXCLUSIVE on credit_ledger through constraint replacement and backfill.
-- Backfill: Rename reservation_release entry_type rows to release once.
-- Verification: migration:empty, migration:upgrade, and focused credit-ledger schema matrix.
-- Rollback posture: forward-fix

BEGIN;
LOCK TABLE "credit_ledger" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_entry_type_check";
ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_type_direction_check";
UPDATE "credit_ledger"
SET "entry_type" = 'release'
WHERE "entry_type" = 'reservation_release';
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_entry_type_check"
  CHECK ("entry_type" IN ('charge','refund','grant','adjustment','reservation_settlement','release'));
ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_type_direction_check"
  CHECK (
    ("entry_type" IN ('charge','reservation_settlement') AND "direction" = 'debit') OR
    ("entry_type" IN ('refund','grant','release') AND "direction" = 'credit') OR
    "entry_type" = 'adjustment'
  );
COMMIT;
