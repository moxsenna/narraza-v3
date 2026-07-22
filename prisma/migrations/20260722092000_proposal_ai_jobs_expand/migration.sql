-- Migration ID: 20260722092000_proposal_ai_jobs_expand
-- UTC date: 2026-07-22 09:20:00Z
-- Workstream: W1.1
-- Purpose: Add 5 proposal/canon, 5 snapshot/AI, and 3 jobs tables with tenant-safe ownership, lifecycle, lease, hash, payload, and deferred pointer integrity.
-- Classification: expand-only
-- Prerequisite: 20260722091000_knowledge_prose_expand
-- Lock profile: New objects plus brief SHARE ROW EXCLUSIVE locks while adding deferred foreign keys to new and existing tables.
-- Backfill: none
-- Verification: pnpm exec prisma validate; pnpm --filter @narraza/db generate; pnpm --dir packages/db exec vitest run --config vitest.schema.config.ts src/schema-test/proposal-ai-jobs.integration.test.ts
-- Rollback posture: forward-fix

CREATE TABLE "canonical_change_sets" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "origin" TEXT NOT NULL, "status" TEXT NOT NULL,
  "base_canonical_version" INTEGER NOT NULL, "operations_hash" TEXT NOT NULL, "applied_canonical_version" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "canonical_change_sets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canonical_change_sets_origin_check" CHECK ("origin" IN ('ai','user','system')),
  CONSTRAINT "canonical_change_sets_status_check" CHECK ("status" IN ('pending','applied','rejected','stale')),
  CONSTRAINT "canonical_change_sets_base_version_check" CHECK ("base_canonical_version" >= 0),
  CONSTRAINT "canonical_change_sets_applied_version_check" CHECK ("applied_canonical_version" IS NULL OR "applied_canonical_version" >= 0),
  CONSTRAINT "canonical_change_sets_lifecycle_check" CHECK (("status" = 'applied' AND "applied_canonical_version" IS NOT NULL) OR ("status" <> 'applied' AND "applied_canonical_version" IS NULL)),
  CONSTRAINT "canonical_change_sets_operations_hash_check" CHECK ("operations_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "canonical_change_sets_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "proposal_groups" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL,
  "dependency_hash" TEXT NOT NULL, "source_job_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "proposal_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proposal_groups_status_check" CHECK ("status" IN ('pending','accepted','rejected','stale','superseded','needs_revalidation')),
  CONSTRAINT "proposal_groups_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "proposal_groups_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "proposals" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "change_set_id" TEXT NOT NULL,
  "source" TEXT NOT NULL, "status" TEXT NOT NULL, "operations_hash" TEXT NOT NULL, "dependency_hash" TEXT NOT NULL,
  "revalidated_from_proposal_id" TEXT, "validation_report_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "proposals_source_check" CHECK ("source" IN ('ai','user','system')),
  CONSTRAINT "proposals_status_check" CHECK ("status" IN ('pending','accepted','rejected','stale','superseded','needs_revalidation')),
  CONSTRAINT "proposals_operations_hash_check" CHECK ("operations_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "proposals_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "proposals_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "canonical_change_operations" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "change_set_id" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
  "operation_type" TEXT NOT NULL, "target_entity_type" TEXT NOT NULL, "target_entity_id" TEXT NOT NULL,
  "expected_revision" INTEGER, "risk" TEXT NOT NULL, "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "canonical_change_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canonical_change_operations_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "canonical_change_operations_expected_revision_check" CHECK ("expected_revision" IS NULL OR "expected_revision" >= 0),
  CONSTRAINT "canonical_change_operations_risk_check" CHECK ("risk" IN ('low','medium','high')),
  CONSTRAINT "canonical_change_operations_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "canonical_change_operations_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "canonical_change_operations_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "canonical_change_operations_change_set_id_ordinal_key" UNIQUE ("change_set_id","ordinal")
);

CREATE TABLE "context_snapshots" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "packet_kind" TEXT NOT NULL, "data_class" TEXT NOT NULL,
  "dependency_hash" TEXT NOT NULL, "content_hash" TEXT NOT NULL, "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "context_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "context_snapshots_packet_kind_check" CHECK ("packet_kind" IN ('planner','writer','validator','repair','extraction')),
  CONSTRAINT "context_snapshots_data_class_check" CHECK ("data_class" IN ('restricted','writer_safe','review_safe')),
  CONSTRAINT "context_snapshots_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "context_snapshots_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "context_snapshots_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "context_snapshots_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "context_snapshots_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "generation_context_bundles" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "snapshot_id" TEXT NOT NULL, "dependency_hash" TEXT NOT NULL,
  "bundle_hash" TEXT NOT NULL, "expires_at" TIMESTAMPTZ(3) NOT NULL, "consumed_at" TIMESTAMPTZ(3),
  "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "generation_context_bundles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_context_bundles_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "generation_context_bundles_bundle_hash_check" CHECK ("bundle_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "generation_context_bundles_expiry_check" CHECK ("expires_at" > "created_at" AND ("consumed_at" IS NULL OR "consumed_at" >= "created_at")),
  CONSTRAINT "generation_context_bundles_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "generation_context_bundles_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "generation_context_bundles_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "generation_context_bundles_project_id_bundle_hash_key" UNIQUE ("project_id","bundle_hash")
);

CREATE TABLE "ai_workflow_plans" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "bundle_id" TEXT NOT NULL, "workflow_kind" TEXT NOT NULL,
  "plan_hash" TEXT NOT NULL, "estimated_max_micro_idr" BIGINT NOT NULL, "schema_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_workflow_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_workflow_plans_plan_hash_check" CHECK ("plan_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ai_workflow_plans_estimated_max_check" CHECK ("estimated_max_micro_idr" >= 0),
  CONSTRAINT "ai_workflow_plans_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "ai_workflow_plans_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "ai_workflow_plans_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "ai_workflow_plans_project_id_bundle_id_id_key" UNIQUE ("project_id","bundle_id","id"),
  CONSTRAINT "ai_workflow_plans_project_id_plan_hash_key" UNIQUE ("project_id","plan_hash")
);

CREATE TABLE "model_price_snapshots" (
  "id" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "requested_model_id" TEXT NOT NULL, "resolved_model_id" TEXT NOT NULL,
  "input_rate_micro_idr" BIGINT NOT NULL, "output_rate_micro_idr" BIGINT NOT NULL, "currency" TEXT NOT NULL,
  "effective_at" TIMESTAMPTZ(3) NOT NULL, "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "model_price_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "model_price_snapshots_rates_check" CHECK ("input_rate_micro_idr" >= 0 AND "output_rate_micro_idr" >= 0),
  CONSTRAINT "model_price_snapshots_currency_check" CHECK ("currency" = 'IDR'),
  CONSTRAINT "model_price_snapshots_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "model_price_snapshots_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "model_price_snapshots_provider_id_resolved_model_id_effecti_key" UNIQUE ("provider_id","resolved_model_id","effective_at")
);

CREATE TABLE "generation_jobs" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL, "lease_token" TEXT, "lease_expires_at" TIMESTAMPTZ(3), "fence_version" INTEGER NOT NULL DEFAULT 0,
  "cancel_requested_at" TIMESTAMPTZ(3), "retry_of_job_id" TEXT, "bundle_id" TEXT, "workflow_plan_id" TEXT, "reservation_id" TEXT,
  "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_jobs_status_check" CHECK ("status" IN ('queued','running','succeeded','failed','dead','cancelled')),
  CONSTRAINT "generation_jobs_priority_check" CHECK ("priority" >= 0),
  CONSTRAINT "generation_jobs_fence_version_check" CHECK ("fence_version" >= 0),
  CONSTRAINT "generation_jobs_lease_check" CHECK (("status" = 'running' AND "lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL) OR ("status" <> 'running' AND "lease_token" IS NULL AND "lease_expires_at" IS NULL)),
  CONSTRAINT "generation_jobs_cancel_check" CHECK ("cancel_requested_at" IS NULL OR "status" IN ('running','cancelled')),
  CONSTRAINT "generation_jobs_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "generation_jobs_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "generation_jobs_project_id_id_key" UNIQUE ("project_id","id")
);

CREATE TABLE "workflow_invocations" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "job_id" TEXT NOT NULL, "stage_key" TEXT NOT NULL,
  "status" TEXT NOT NULL, "winner_attempt_id" TEXT, "fence_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "workflow_invocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_invocations_status_check" CHECK ("status" IN ('queued','running','succeeded','failed','cancelled')),
  CONSTRAINT "workflow_invocations_fence_version_check" CHECK ("fence_version" >= 0),
  CONSTRAINT "workflow_invocations_winner_status_check" CHECK (("status" = 'succeeded') = ("winner_attempt_id" IS NOT NULL)),
  CONSTRAINT "workflow_invocations_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "workflow_invocations_project_id_job_id_id_key" UNIQUE ("project_id","job_id","id"),
  CONSTRAINT "workflow_invocations_job_id_stage_key_key" UNIQUE ("job_id","stage_key")
);

CREATE TABLE "generation_attempts" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "job_id" TEXT NOT NULL, "invocation_id" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
  "status" TEXT NOT NULL, "provider_request_id" TEXT, "result_hash" TEXT, "started_at" TIMESTAMPTZ(3) NOT NULL,
  "finished_at" TIMESTAMPTZ(3), "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_attempts_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "generation_attempts_status_check" CHECK ("status" IN ('started','succeeded','failed','cancelled')),
  CONSTRAINT "generation_attempts_result_hash_check" CHECK ("result_hash" IS NULL OR "result_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "generation_attempts_lifecycle_check" CHECK (("status" = 'started' AND "finished_at" IS NULL) OR ("status" <> 'started' AND "finished_at" IS NOT NULL AND "finished_at" >= "started_at")),
  CONSTRAINT "generation_attempts_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "generation_attempts_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "generation_attempts_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "generation_attempts_project_id_job_id_id_key" UNIQUE ("project_id","job_id","id"),
  CONSTRAINT "generation_attempts_project_id_job_id_invocation_id_id_key" UNIQUE ("project_id","job_id","invocation_id","id"),
  CONSTRAINT "generation_attempts_invocation_id_ordinal_key" UNIQUE ("invocation_id","ordinal")
);

CREATE TABLE "generated_candidates" (
  "id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "group_id" TEXT NOT NULL, "job_id" TEXT, "ordinal" INTEGER NOT NULL,
  "prose_version_id" TEXT, "schema_version" INTEGER NOT NULL DEFAULT 1, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "generated_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generated_candidates_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "generated_candidates_schema_version_check" CHECK ("schema_version" > 0),
  CONSTRAINT "generated_candidates_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "generated_candidates_project_id_id_key" UNIQUE ("project_id","id"),
  CONSTRAINT "generated_candidates_group_id_ordinal_key" UNIQUE ("group_id","ordinal")
);

CREATE TABLE "ai_usage_events" (
  "id" TEXT NOT NULL, "project_id" TEXT, "job_id" TEXT, "attempt_id" TEXT, "price_snapshot_id" TEXT NOT NULL,
  "input_tokens" INTEGER NOT NULL, "output_tokens" INTEGER NOT NULL, "provider_cost_micro_idr" BIGINT NOT NULL,
  "charged_party" TEXT NOT NULL, "dedupe_key" TEXT NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_events_usage_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "provider_cost_micro_idr" >= 0),
  CONSTRAINT "ai_usage_events_charged_party_check" CHECK ("charged_party" IN ('user','system')),
  CONSTRAINT "ai_usage_events_dedupe_key_key" UNIQUE ("dedupe_key")
);

CREATE INDEX "proposal_groups_project_id_status_idx" ON "proposal_groups" ("project_id","status");
CREATE INDEX "proposals_project_id_group_id_status_idx" ON "proposals" ("project_id","group_id","status");
CREATE INDEX "proposals_project_id_status_idx" ON "proposals" ("project_id","status");
CREATE INDEX "proposals_project_pending_idx" ON "proposals" ("project_id","created_at","id") WHERE "status" = 'pending';
CREATE INDEX "canonical_change_sets_project_id_status_idx" ON "canonical_change_sets" ("project_id","status");
CREATE INDEX "canonical_change_operations_project_id_target_entity_type_t_idx" ON "canonical_change_operations" ("project_id","target_entity_type","target_entity_id");
CREATE INDEX "context_snapshots_project_id_dependency_hash_idx" ON "context_snapshots" ("project_id","dependency_hash");
CREATE INDEX "generation_context_bundles_unconsumed_expiry_idx" ON "generation_context_bundles" ("expires_at","id") WHERE "consumed_at" IS NULL;
CREATE INDEX "generation_jobs_queued_claim_idx" ON "generation_jobs" ("available_at","priority" DESC,"created_at","id") WHERE "status" = 'queued';
CREATE INDEX "generation_jobs_expired_running_lease_idx" ON "generation_jobs" ("lease_expires_at","id") WHERE "status" = 'running';
CREATE INDEX "generation_attempts_unfinished_idx" ON "generation_attempts" ("project_id","job_id","started_at","id") WHERE "finished_at" IS NULL;
CREATE INDEX "generated_candidates_project_id_group_id_idx" ON "generated_candidates" ("project_id","group_id");
CREATE INDEX "ai_usage_events_project_id_created_at_idx" ON "ai_usage_events" ("project_id","created_at");
CREATE INDEX "ai_usage_events_job_id_idx" ON "ai_usage_events" ("job_id");
CREATE INDEX "ai_usage_events_attempt_id_idx" ON "ai_usage_events" ("attempt_id");

ALTER TABLE "canonical_change_sets" ADD CONSTRAINT "canonical_change_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_groups" ADD CONSTRAINT "proposal_groups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_group_id_fkey" FOREIGN KEY ("project_id","group_id") REFERENCES "proposal_groups"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_change_set_id_fkey" FOREIGN KEY ("project_id","change_set_id") REFERENCES "canonical_change_sets"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_revalidated_from_proposal_id_fkey" FOREIGN KEY ("project_id","revalidated_from_proposal_id") REFERENCES "proposals"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "canonical_change_operations" ADD CONSTRAINT "canonical_change_operations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canonical_change_operations" ADD CONSTRAINT "canonical_change_operations_project_id_change_set_id_fkey" FOREIGN KEY ("project_id","change_set_id") REFERENCES "canonical_change_sets"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_context_bundles" ADD CONSTRAINT "generation_context_bundles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_context_bundles" ADD CONSTRAINT "generation_context_bundles_project_id_snapshot_id_fkey" FOREIGN KEY ("project_id","snapshot_id") REFERENCES "context_snapshots"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_plans" ADD CONSTRAINT "ai_workflow_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_workflow_plans" ADD CONSTRAINT "ai_workflow_plans_project_id_bundle_id_fkey" FOREIGN KEY ("project_id","bundle_id") REFERENCES "generation_context_bundles"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_retry_of_job_id_fkey" FOREIGN KEY ("project_id","retry_of_job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_bundle_id_fkey" FOREIGN KEY ("project_id","bundle_id") REFERENCES "generation_context_bundles"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_bundle_id_workflow_plan_id_fkey" FOREIGN KEY ("project_id","bundle_id","workflow_plan_id") REFERENCES "ai_workflow_plans"("project_id","bundle_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "workflow_invocations" ADD CONSTRAINT "workflow_invocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_invocations" ADD CONSTRAINT "workflow_invocations_project_id_job_id_fkey" FOREIGN KEY ("project_id","job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_project_id_job_id_fkey" FOREIGN KEY ("project_id","job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_project_id_job_id_invocation_id_fkey" FOREIGN KEY ("project_id","job_id","invocation_id") REFERENCES "workflow_invocations"("project_id","job_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_invocations" ADD CONSTRAINT "workflow_invocations_winner_attempt_fkey" FOREIGN KEY ("project_id","job_id","id","winner_attempt_id") REFERENCES "generation_attempts"("project_id","job_id","invocation_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generated_candidates" ADD CONSTRAINT "generated_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_candidates" ADD CONSTRAINT "generated_candidates_project_id_group_id_fkey" FOREIGN KEY ("project_id","group_id") REFERENCES "proposal_groups"("project_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_candidates" ADD CONSTRAINT "generated_candidates_project_id_job_id_fkey" FOREIGN KEY ("project_id","job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "model_price_snapshots" ADD CONSTRAINT "model_price_snapshots_schema_version_payload_guard" CHECK ("schema_version" > 0 AND jsonb_typeof("payload") = 'object');
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_price_snapshot_id_fkey" FOREIGN KEY ("price_snapshot_id") REFERENCES "model_price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proposal_groups" ADD CONSTRAINT "proposal_groups_project_id_source_job_id_fkey" FOREIGN KEY ("project_id","source_job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generated_candidates" ADD CONSTRAINT "generated_candidates_job_project_guard" CHECK ("job_id" IS NULL OR "project_id" IS NOT NULL);
ALTER TABLE "intake_messages" ADD CONSTRAINT "intake_messages_job_fkey" FOREIGN KEY ("project_id","job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "concept_sets" ADD CONSTRAINT "concept_sets_source_job_fkey" FOREIGN KEY ("project_id","source_job_id") REFERENCES "generation_jobs"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "prose_versions" ADD CONSTRAINT "prose_versions_project_id_source_candidate_id_id_key" UNIQUE ("project_id","source_candidate_id","id");
ALTER TABLE "prose_versions" ADD CONSTRAINT "prose_versions_project_id_source_candidate_id_fkey" FOREIGN KEY ("project_id","source_candidate_id") REFERENCES "generated_candidates"("project_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generated_candidates" ADD CONSTRAINT "generated_candidates_prose_backpointer_fkey" FOREIGN KEY ("project_id","id","prose_version_id") REFERENCES "prose_versions"("project_id","source_candidate_id","id") ON DELETE NO ACTION ON UPDATE CASCADE;
