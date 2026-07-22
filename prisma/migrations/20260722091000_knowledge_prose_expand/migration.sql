-- Migration ID: 20260722091000_knowledge_prose_expand
-- UTC date: 2026-07-22 09:10:00Z
-- Workstream: W1.1
-- Purpose: Add 5 knowledge/reveal tables and 3 prose tables with tenant-safe ownership, lifecycle constraints, partial active uniqueness, and accepted-prose integrity.
-- Classification: expand-only
-- Prerequisite: 20260722090000_planning_expand
-- Lock profile: New objects plus brief SHARE ROW EXCLUSIVE locks while adding foreign keys to new and planning tables.
-- Backfill: none
-- Verification: pnpm exec prisma validate; pnpm --filter @narraza/db generate; pnpm --filter @narraza/db exec vitest run --config vitest.schema.config.ts src/schema-test/soft-delete-unique.integration.test.ts src/schema-test/prose-fk.integration.test.ts
-- Rollback posture: forward-fix

CREATE TABLE "facts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fact_key" TEXT NOT NULL,
    "canon_status" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "facts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "facts_canon_status_check" CHECK ("canon_status" IN ('confirmed', 'deprecated', 'contradicted')),
    CONSTRAINT "facts_visibility_check" CHECK ("visibility" IN ('private', 'reader_known', 'public')),
    CONSTRAINT "facts_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "facts_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "facts_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "facts_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "prose_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "beat_id" TEXT NOT NULL,
    "source_candidate_id" TEXT,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "prose_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prose_versions_status_check" CHECK ("status" IN ('draft', 'validated', 'rejected', 'superseded')),
    CONSTRAINT "prose_versions_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "prose_versions_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "prose_versions_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "prose_versions_project_id_beat_id_id_key" UNIQUE ("project_id", "beat_id", "id")
);

CREATE TABLE "prose_working_drafts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "beat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "prose_working_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prose_working_drafts_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "prose_working_drafts_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "prose_working_drafts_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "prose_evidence" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "prose_version_id" TEXT NOT NULL,
    "start_utf16" INTEGER NOT NULL,
    "end_utf16" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "prose_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prose_evidence_offsets_check" CHECK (0 <= "start_utf16" AND "start_utf16" <= "end_utf16"),
    CONSTRAINT "prose_evidence_content_hash_check" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "prose_evidence_evidence_type_check" CHECK ("evidence_type" IN ('fact', 'state', 'belief', 'disclosure', 'validation')),
    CONSTRAINT "prose_evidence_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "prose_evidence_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "prose_evidence_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "prose_evidence_project_id_prose_version_id_id_key" UNIQUE ("project_id", "prose_version_id", "id")
);

CREATE TABLE "fact_disclosures" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "prose_version_id" TEXT,
    "event_type" TEXT NOT NULL,
    "effective_sequence" INTEGER NOT NULL,
    "retracts_disclosure_id" TEXT,
    "evidence_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "fact_disclosures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fact_disclosures_event_type_check" CHECK ("event_type" IN ('disclose', 'retract')),
    CONSTRAINT "fact_disclosures_effective_sequence_check" CHECK ("effective_sequence" >= 0),
    CONSTRAINT "fact_disclosures_retraction_coherence_check" CHECK (("event_type" = 'disclose' AND "retracts_disclosure_id" IS NULL) OR ("event_type" = 'retract' AND "retracts_disclosure_id" IS NOT NULL)),
    CONSTRAINT "fact_disclosures_evidence_coherence_check" CHECK (("prose_version_id" IS NULL AND "evidence_id" IS NULL) OR ("prose_version_id" IS NOT NULL AND "evidence_id" IS NOT NULL)),
    CONSTRAINT "fact_disclosures_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "fact_disclosures_project_id_fact_id_id_key" UNIQUE ("project_id", "fact_id", "id")
);

CREATE TABLE "reader_fact_states" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "as_of_sequence" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "source_disclosure_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "reader_fact_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reader_fact_states_as_of_sequence_check" CHECK ("as_of_sequence" >= 0),
    CONSTRAINT "reader_fact_states_state_check" CHECK ("state" IN ('unknown', 'suspected', 'known', 'retracted')),
    CONSTRAINT "reader_fact_states_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "reader_fact_states_project_id_fact_id_key" UNIQUE ("project_id", "fact_id")
);

CREATE TABLE "reveals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "fact_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "beat_id" TEXT,
    "target_sequence" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "reveals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reveals_target_sequence_check" CHECK ("target_sequence" >= 0),
    CONSTRAINT "reveals_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "reveals_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "reveals_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "reveals_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "reveal_breadcrumbs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reveal_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "beat_id" TEXT,
    "sequence" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "reveal_breadcrumbs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reveal_breadcrumbs_sequence_check" CHECK ("sequence" >= 0),
    CONSTRAINT "reveal_breadcrumbs_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "reveal_breadcrumbs_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "reveal_breadcrumbs_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "reveal_breadcrumbs_reveal_id_sequence_key" UNIQUE ("reveal_id", "sequence")
);

ALTER TABLE "beats" ADD CONSTRAINT "beats_project_id_chapter_id_id_key" UNIQUE ("project_id", "chapter_id", "id");
CREATE UNIQUE INDEX "beats_project_id_id_accepted_prose_version_id_key" ON "beats" ("project_id", "id", "accepted_prose_version_id");
CREATE UNIQUE INDEX "facts_project_fact_key_active_key" ON "facts" ("project_id", "fact_key") WHERE "deleted_at" IS NULL;
CREATE INDEX "facts_project_id_canon_status_idx" ON "facts" ("project_id", "canon_status");
CREATE INDEX "prose_versions_project_id_beat_id_created_at_idx" ON "prose_versions" ("project_id", "beat_id", "created_at");
CREATE UNIQUE INDEX "prose_working_drafts_project_id_user_id_beat_id_active_key" ON "prose_working_drafts" ("project_id", "user_id", "beat_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "prose_working_drafts_user_id_idx" ON "prose_working_drafts" ("user_id");
CREATE INDEX "prose_evidence_project_id_prose_version_id_start_utf16_end_utf16_idx" ON "prose_evidence" ("project_id", "prose_version_id", "start_utf16", "end_utf16");
CREATE INDEX "fact_disclosures_fold_idx" ON "fact_disclosures" ("project_id", "fact_id", "effective_sequence" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "reveals_project_id_target_sequence_idx" ON "reveals" ("project_id", "target_sequence");
CREATE INDEX "reveal_breadcrumbs_project_id_reveal_id_sequence_idx" ON "reveal_breadcrumbs" ("project_id", "reveal_id", "sequence");

ALTER TABLE "facts" ADD CONSTRAINT "facts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_versions" ADD CONSTRAINT "prose_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_versions" ADD CONSTRAINT "prose_versions_project_id_beat_id_fkey" FOREIGN KEY ("project_id", "beat_id") REFERENCES "beats" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_working_drafts" ADD CONSTRAINT "prose_working_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_working_drafts" ADD CONSTRAINT "prose_working_drafts_project_id_beat_id_fkey" FOREIGN KEY ("project_id", "beat_id") REFERENCES "beats" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_working_drafts" ADD CONSTRAINT "prose_working_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prose_evidence" ADD CONSTRAINT "prose_evidence_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prose_evidence" ADD CONSTRAINT "prose_evidence_project_id_prose_version_id_fkey" FOREIGN KEY ("project_id", "prose_version_id") REFERENCES "prose_versions" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_project_id_prose_version_id_fkey" FOREIGN KEY ("project_id", "prose_version_id") REFERENCES "prose_versions" ("project_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "fact_disclosures" ADD CONSTRAINT "fact_disclosures_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fact_disclosures" ADD CONSTRAINT "fact_disclosures_project_id_fact_id_fkey" FOREIGN KEY ("project_id", "fact_id") REFERENCES "facts" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fact_disclosures" ADD CONSTRAINT "fact_disclosures_project_id_prose_version_id_fkey" FOREIGN KEY ("project_id", "prose_version_id") REFERENCES "prose_versions" ("project_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "fact_disclosures" ADD CONSTRAINT "fact_disclosures_retraction_fact_fkey" FOREIGN KEY ("project_id", "fact_id", "retracts_disclosure_id") REFERENCES "fact_disclosures" ("project_id", "fact_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fact_disclosures" ADD CONSTRAINT "fact_disclosures_evidence_prose_fkey" FOREIGN KEY ("project_id", "prose_version_id", "evidence_id") REFERENCES "prose_evidence" ("project_id", "prose_version_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "reader_fact_states" ADD CONSTRAINT "reader_fact_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reader_fact_states" ADD CONSTRAINT "reader_fact_states_project_id_fact_id_fkey" FOREIGN KEY ("project_id", "fact_id") REFERENCES "facts" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reader_fact_states" ADD CONSTRAINT "reader_fact_states_source_fact_fkey" FOREIGN KEY ("project_id", "fact_id", "source_disclosure_id") REFERENCES "fact_disclosures" ("project_id", "fact_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_project_id_fact_id_fkey" FOREIGN KEY ("project_id", "fact_id") REFERENCES "facts" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_project_id_chapter_id_fkey" FOREIGN KEY ("project_id", "chapter_id") REFERENCES "chapters" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveals" ADD CONSTRAINT "reveals_beat_chapter_fkey" FOREIGN KEY ("project_id", "chapter_id", "beat_id") REFERENCES "beats" ("project_id", "chapter_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "reveal_breadcrumbs" ADD CONSTRAINT "reveal_breadcrumbs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveal_breadcrumbs" ADD CONSTRAINT "reveal_breadcrumbs_project_id_reveal_id_fkey" FOREIGN KEY ("project_id", "reveal_id") REFERENCES "reveals" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveal_breadcrumbs" ADD CONSTRAINT "reveal_breadcrumbs_project_id_chapter_id_fkey" FOREIGN KEY ("project_id", "chapter_id") REFERENCES "chapters" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reveal_breadcrumbs" ADD CONSTRAINT "reveal_breadcrumbs_beat_chapter_fkey" FOREIGN KEY ("project_id", "chapter_id", "beat_id") REFERENCES "beats" ("project_id", "chapter_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "beats" ADD CONSTRAINT "beats_accepted_prose_belongs_to_beat_fkey" FOREIGN KEY ("project_id", "id", "accepted_prose_version_id") REFERENCES "prose_versions" ("project_id", "beat_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
