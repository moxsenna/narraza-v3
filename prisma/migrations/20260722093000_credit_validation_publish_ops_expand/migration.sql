-- Migration ID: 20260722093000_credit_validation_publish_ops_expand
-- UTC date: 2026-07-22 09:30:00Z
-- Workstream: W1.1
-- Purpose: Add 3 credit, 2 validation, 2 publish, and 2 outbox tables with financial, tenant, source, dedupe, delivery, and retention integrity.
-- Classification: expand-only
-- Prerequisite: 20260722092000_proposal_ai_jobs_expand
-- Lock profile: New objects plus brief SHARE ROW EXCLUSIVE locks while adding reservation and validation report pointers to existing tables.
-- Backfill: none
-- Verification: pnpm exec prisma validate; pnpm --filter @narraza/db generate; pnpm --dir packages/db exec vitest run --config vitest.schema.config.ts src/schema-test/credit-validation-ops.integration.test.ts src/schema-test/credit-validation-ops-quality-gaps.integration.test.ts src/schema-test/schema-inventory.integration.test.ts
-- Rollback posture: forward-fix

CREATE TABLE "credit_ledger" (
  "id" TEXT NOT NULL, "user_id" TEXT, "project_id" TEXT, "reservation_id" TEXT, "attempt_id" TEXT,
  "entry_type" TEXT NOT NULL, "direction" TEXT NOT NULL, "amount_micro_idr" BIGINT NOT NULL,
  "dedupe_key" TEXT NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_ledger_entry_type_check" CHECK ("entry_type" IN ('charge','refund','grant','adjustment','reservation_settlement','reservation_release')),
  CONSTRAINT "credit_ledger_direction_check" CHECK ("direction" IN ('debit','credit')),
  CONSTRAINT "credit_ledger_amount_check" CHECK ("amount_micro_idr" > 0),
  CONSTRAINT "credit_ledger_type_direction_check" CHECK (
    ("entry_type" IN ('charge','reservation_settlement') AND "direction" = 'debit') OR
    ("entry_type" IN ('refund','grant','reservation_release') AND "direction" = 'credit') OR
    "entry_type" = 'adjustment'
  ),
  CONSTRAINT "credit_ledger_dedupe_key_key" UNIQUE ("dedupe_key")
);

CREATE TABLE "credit_reservations" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "project_id" TEXT, "job_id" TEXT, "status" TEXT NOT NULL,
  "reserved_micro_idr" BIGINT NOT NULL, "settled_micro_idr" BIGINT NOT NULL DEFAULT 0,
  "released_micro_idr" BIGINT NOT NULL DEFAULT 0, "exposure_micro_idr" BIGINT NOT NULL,
  "closing_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_reservations_status_check" CHECK ("status" IN ('open','closing','settled','released','expired','cancelled')),
  CONSTRAINT "credit_reservations_amounts_check" CHECK (
    "reserved_micro_idr" > 0 AND "settled_micro_idr" >= 0 AND "released_micro_idr" >= 0 AND "exposure_micro_idr" >= 0 AND
    "settled_micro_idr" + "released_micro_idr" + "exposure_micro_idr" = "reserved_micro_idr"
  ),
  CONSTRAINT "credit_reservations_binding_check" CHECK ("job_id" IS NULL OR "project_id" IS NOT NULL),
  CONSTRAINT "credit_reservations_lifecycle_check" CHECK (
    ("status" = 'open' AND "closing_at" IS NULL AND "settled_micro_idr" = 0 AND "released_micro_idr" = 0 AND "exposure_micro_idr" = "reserved_micro_idr") OR
    ("status" = 'closing' AND "closing_at" IS NOT NULL AND "exposure_micro_idr" > 0) OR
    ("status" = 'settled' AND "closing_at" IS NOT NULL AND "settled_micro_idr" > 0 AND "settled_micro_idr" + "released_micro_idr" = "reserved_micro_idr" AND "exposure_micro_idr" = 0) OR
    ("status" IN ('released','expired','cancelled') AND "closing_at" IS NOT NULL AND "settled_micro_idr" = 0 AND "released_micro_idr" = "reserved_micro_idr" AND "exposure_micro_idr" = 0)
  ),
  CONSTRAINT "credit_reservations_project_id_job_id_id_key" UNIQUE ("project_id","job_id","id")
);

CREATE TABLE "credit_quotes" (
  "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "workflow_plan_id" TEXT,
  "workflow_plan_hash" TEXT NOT NULL, "dependency_hash" TEXT NOT NULL, "max_amount_micro_idr" BIGINT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, "consumed_at" TIMESTAMPTZ(3), "request_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "credit_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_quotes_workflow_plan_hash_check" CHECK ("workflow_plan_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "credit_quotes_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "credit_quotes_amount_check" CHECK ("max_amount_micro_idr" >= 0),
  CONSTRAINT "credit_quotes_time_check" CHECK ("expires_at" > "created_at" AND ("consumed_at" IS NULL OR "consumed_at" >= "created_at"))
);

CREATE TABLE "validation_reports" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "prose_version_id" TEXT NOT NULL,
  "prose_content_hash" TEXT NOT NULL, "policy_version" TEXT NOT NULL, "status" TEXT NOT NULL, "passed" BOOLEAN NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "validation_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "validation_reports_status_check" CHECK ("status" IN ('pending','running','completed','failed')),
  CONSTRAINT "validation_reports_lifecycle_check" CHECK (("status" = 'completed') OR NOT "passed"),
  CONSTRAINT "validation_reports_hash_check" CHECK ("prose_content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "validation_reports_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "validation_reports_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "validation_reports_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "validation_reports_project_id_prose_version_id_id_key" UNIQUE ("project_id","prose_version_id","id"),
  CONSTRAINT "validation_reports_prose_hash_policy_key" UNIQUE ("prose_version_id","prose_content_hash","policy_version")
);

CREATE TABLE "validation_findings" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "report_id" TEXT NOT NULL, "prose_version_id" TEXT NOT NULL,
  "source" TEXT NOT NULL, "severity" TEXT NOT NULL, "rule_key" TEXT NOT NULL, "message" TEXT NOT NULL,
  "evidence_id" TEXT, "override_status" TEXT, "override_reason" TEXT,
  "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "validation_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "validation_findings_source_check" CHECK ("source" IN ('validator','human','system')),
  CONSTRAINT "validation_findings_severity_check" CHECK ("severity" IN ('info','warning','error','blocking')),
  CONSTRAINT "validation_findings_override_check" CHECK (
    ("override_status" IS NULL AND "override_reason" IS NULL) OR
    ("override_status" IN ('accepted','rejected') AND "override_reason" IS NOT NULL)
  ),
  CONSTRAINT "validation_findings_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "validation_findings_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "validation_findings_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "artifact_proposals" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "prose_version_id" TEXT NOT NULL, "status" TEXT NOT NULL,
  "dependency_hash" TEXT NOT NULL, "source_job_id" TEXT, "schema_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "artifact_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artifact_proposals_status_check" CHECK ("status" IN ('pending','accepted','rejected','stale','published')),
  CONSTRAINT "artifact_proposals_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "artifact_proposals_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "artifact_proposals_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "artifact_proposals_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "artifact_proposals_project_id_id_prose_version_id_key" UNIQUE ("project_id","id","prose_version_id")
);

CREATE TABLE "publish_artifacts" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "artifact_proposal_id" TEXT NOT NULL,
  "prose_version_id" TEXT NOT NULL, "artifact_type" TEXT NOT NULL, "content_hash" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "publish_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publish_artifacts_type_check" CHECK ("artifact_type" IN ('text','html','markdown','epub','pdf')),
  CONSTRAINT "publish_artifacts_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "publish_artifacts_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "publish_artifacts_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "publish_artifacts_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "publish_artifacts_proposal_type_key" UNIQUE ("artifact_proposal_id","artifact_type")
);

CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL, "aggregate_type" TEXT NOT NULL, "aggregate_id" TEXT NOT NULL, "event_type" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL, "occurred_at" TIMESTAMPTZ(3) NOT NULL, "schema_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "outbox_events_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "outbox_events_dedupe_key_key" UNIQUE ("dedupe_key")
);

CREATE TABLE "outbox_receipts" (
  "id" TEXT NOT NULL, "outbox_event_id" TEXT NOT NULL, "consumer_key" TEXT NOT NULL,
  "delivery_generation" INTEGER NOT NULL, "status" TEXT NOT NULL, "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "processing_started_at" TIMESTAMPTZ(3), "lease_expires_at" TIMESTAMPTZ(3), "completed_at" TIMESTAMPTZ(3),
  "uncertain_at" TIMESTAMPTZ(3), "dead_at" TIMESTAMPTZ(3), "last_error_code" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "outbox_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_receipts_generation_check" CHECK ("delivery_generation" >= 0),
  CONSTRAINT "outbox_receipts_attempt_count_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "outbox_receipts_status_check" CHECK ("status" IN ('processing','completed','uncertain','dead')),
  CONSTRAINT "outbox_receipts_lifecycle_check" CHECK (
    ("status" = 'processing' AND "processing_started_at" IS NOT NULL AND "lease_expires_at" IS NOT NULL AND "completed_at" IS NULL AND "uncertain_at" IS NULL AND "dead_at" IS NULL) OR
    ("status" = 'completed' AND "processing_started_at" IS NOT NULL AND "lease_expires_at" IS NULL AND "completed_at" IS NOT NULL AND "uncertain_at" IS NULL AND "dead_at" IS NULL) OR
    ("status" = 'uncertain' AND "processing_started_at" IS NOT NULL AND "lease_expires_at" IS NULL AND "completed_at" IS NULL AND "uncertain_at" IS NOT NULL AND "dead_at" IS NULL) OR
    ("status" = 'dead' AND "processing_started_at" IS NOT NULL AND "lease_expires_at" IS NULL AND "completed_at" IS NULL AND "uncertain_at" IS NULL AND "dead_at" IS NOT NULL)
  ),
  CONSTRAINT "outbox_receipts_event_consumer_generation_key" UNIQUE ("outbox_event_id","consumer_key","delivery_generation")
);

CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger" ("user_id","created_at");
CREATE INDEX "credit_ledger_project_id_created_at_idx" ON "credit_ledger" ("project_id","created_at");
CREATE INDEX "credit_ledger_reservation_id_idx" ON "credit_ledger" ("reservation_id");
CREATE INDEX "credit_ledger_attempt_id_idx" ON "credit_ledger" ("attempt_id");
CREATE INDEX "credit_reservations_user_id_status_idx" ON "credit_reservations" ("user_id","status");
CREATE INDEX "credit_reservations_closing_idx" ON "credit_reservations" ("closing_at","id") WHERE "status" = 'closing';
CREATE INDEX "credit_quotes_user_id_expires_at_idx" ON "credit_quotes" ("user_id","expires_at");
CREATE UNIQUE INDEX "credit_quotes_request_id_key" ON "credit_quotes" ("request_id") WHERE "request_id" IS NOT NULL;
CREATE INDEX "credit_quotes_unconsumed_expiry_idx" ON "credit_quotes" ("expires_at","id") WHERE "consumed_at" IS NULL;
CREATE INDEX "validation_findings_report_severity_idx" ON "validation_findings" ("project_id","report_id","severity");
CREATE INDEX "artifact_proposals_project_id_status_idx" ON "artifact_proposals" ("project_id","status");
CREATE INDEX "outbox_receipts_consumer_status_updated_at_idx" ON "outbox_receipts" ("consumer_key","status","updated_at");

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Financial evidence survives project purge: scalar project attribution remains, nullable job pointer is cleared.
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_plans" ADD CONSTRAINT "ai_workflow_plans_project_id_id_plan_hash_key" UNIQUE ("project_id","id","plan_hash");
ALTER TABLE "credit_quotes" ADD CONSTRAINT "credit_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Quote keeps scalar project/hash attribution; nullable workflow identifier clears when project-owned plan is purged.
ALTER TABLE "credit_quotes" ADD CONSTRAINT "credit_quotes_workflow_plan_id_fkey" FOREIGN KEY ("workflow_plan_id") REFERENCES "ai_workflow_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE FUNCTION "check_credit_quote_plan_binding"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workflow_plan_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ai_workflow_plans" plan
    WHERE plan."id" = NEW."workflow_plan_id"
      AND plan."project_id" = NEW."project_id"
      AND plan."plan_hash" = NEW."workflow_plan_hash"
  ) THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'credit_quotes_plan_binding_fkey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "credit_quotes_plan_binding_trigger"
AFTER INSERT OR UPDATE OF "project_id","workflow_plan_id","workflow_plan_hash" ON "credit_quotes"
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "check_credit_quote_plan_binding"();
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_project_id_prose_version_id_fkey" FOREIGN KEY ("project_id","prose_version_id") REFERENCES "prose_versions"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_prose_hash_binding_fkey" FOREIGN KEY ("project_id","prose_version_id","prose_content_hash") REFERENCES "prose_versions"("project_id","id","content_hash") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_report_prose_fkey" FOREIGN KEY ("project_id","prose_version_id","report_id") REFERENCES "validation_reports"("project_id","prose_version_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_evidence_prose_fkey" FOREIGN KEY ("project_id","prose_version_id","evidence_id") REFERENCES "prose_evidence"("project_id","prose_version_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "artifact_proposals" ADD CONSTRAINT "artifact_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifact_proposals" ADD CONSTRAINT "artifact_proposals_prose_fkey" FOREIGN KEY ("project_id","prose_version_id") REFERENCES "prose_versions"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifact_proposals" ADD CONSTRAINT "artifact_proposals_source_job_fkey" FOREIGN KEY ("project_id","source_job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "publish_artifacts" ADD CONSTRAINT "publish_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publish_artifacts" ADD CONSTRAINT "publish_artifacts_proposal_source_fkey" FOREIGN KEY ("project_id","artifact_proposal_id","prose_version_id") REFERENCES "artifact_proposals"("project_id","id","prose_version_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publish_artifacts" ADD CONSTRAINT "publish_artifacts_prose_fkey" FOREIGN KEY ("project_id","prose_version_id") REFERENCES "prose_versions"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbox_receipts" ADD CONSTRAINT "outbox_receipts_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Avoid reservation/job FK cycle while preserving same-job pointer validation and purge-safe scalar evidence.
CREATE FUNCTION "check_generation_job_reservation_binding"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."reservation_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "credit_reservations" reservation
    WHERE reservation."id" = NEW."reservation_id"
      AND reservation."project_id" = NEW."project_id"
      AND reservation."job_id" = NEW."id"
  ) THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'generation_jobs_reservation_binding_fkey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "generation_jobs_reservation_binding_trigger"
AFTER INSERT OR UPDATE OF "project_id","id","reservation_id" ON "generation_jobs"
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "check_generation_job_reservation_binding"();
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_validation_report_fkey" FOREIGN KEY ("project_id","validation_report_id") REFERENCES "validation_reports"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
