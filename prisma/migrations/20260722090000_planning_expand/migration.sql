-- Migration ID: 20260722090000_planning_expand
-- UTC date: 2026-07-22 09:00:00Z
-- Workstream: W1.1
-- Purpose: Add 13 project and planning tables with tenant-safe ownership constraints and indexes.
-- Classification: expand-only
-- Prerequisite: 20260721181246_init_m0_auth
-- Lock profile: New objects plus brief SHARE ROW EXCLUSIVE locks while adding foreign keys to new tables and users.
-- Backfill: none
-- Verification: pnpm exec prisma validate; pnpm --filter @narraza/db generate; pnpm --filter @narraza/db exec vitest run --config vitest.schema.config.ts src/schema-test/planning.integration.test.ts
-- Rollback posture: forward-fix

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intake_path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_canonical_version" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_intake_path_check" CHECK ("intake_path" IN ('guided', 'freeform')),
    CONSTRAINT "projects_status_check" CHECK ("status" IN ('active', 'archived')),
    CONSTRAINT "projects_current_canonical_version_check" CHECK ("current_canonical_version" >= 0),
    CONSTRAINT "projects_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "projects_id_owner_user_id_key" UNIQUE ("id", "owner_user_id")
);

CREATE TABLE "intake_sessions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signal_count" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "intake_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "intake_sessions_status_check" CHECK ("status" IN ('active', 'completed', 'abandoned')),
    CONSTRAINT "intake_sessions_signal_count_check" CHECK ("signal_count" >= 0),
    CONSTRAINT "intake_sessions_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "intake_sessions_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "intake_sessions_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "intake_messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "intake_session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "job_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "intake_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "intake_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'system')),
    CONSTRAINT "intake_messages_sequence_check" CHECK ("sequence" >= 0),
    CONSTRAINT "intake_messages_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "intake_messages_intake_session_id_sequence_key" UNIQUE ("intake_session_id", "sequence")
);

CREATE TABLE "concept_sets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_job_id" TEXT,
    "status" TEXT NOT NULL,
    "dependency_hash" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "concept_sets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "concept_sets_status_check" CHECK ("status" IN ('draft', 'generated', 'selected', 'superseded')),
    CONSTRAINT "concept_sets_dependency_hash_check" CHECK ("dependency_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "concept_sets_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "concept_sets_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "concept_sets_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "concept_set_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "concepts_ordinal_check" CHECK ("ordinal" >= 0),
    CONSTRAINT "concepts_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "concepts_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "concepts_project_id_id_key" UNIQUE ("project_id", "id"),
    CONSTRAINT "concepts_concept_set_id_ordinal_key" UNIQUE ("concept_set_id", "ordinal")
);

CREATE TABLE "foundations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "foundations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "foundations_status_check" CHECK ("status" IN ('draft', 'confirmed', 'locked')),
    CONSTRAINT "foundations_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "foundations_lifecycle_timestamps_check" CHECK (("status" = 'draft' AND "confirmed_at" IS NULL AND "locked_at" IS NULL) OR ("status" = 'confirmed' AND "confirmed_at" IS NOT NULL AND "locked_at" IS NULL) OR ("status" = 'locked' AND "confirmed_at" IS NOT NULL AND "locked_at" IS NOT NULL AND "locked_at" >= "confirmed_at")),
    CONSTRAINT "foundations_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "foundations_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "foundations_project_id_key" UNIQUE ("project_id"),
    CONSTRAINT "foundations_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "characters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "characters_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "characters_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "characters_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "characters_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "character_states" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "effective_sequence" INTEGER NOT NULL,
    "prose_version_id" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "character_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "character_states_effective_sequence_check" CHECK ("effective_sequence" >= 0),
    CONSTRAINT "character_states_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "character_states_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "character_states_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "character_beliefs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "belief_key" TEXT NOT NULL,
    "effective_sequence" INTEGER NOT NULL,
    "reason_code" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "character_beliefs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "character_beliefs_effective_sequence_check" CHECK ("effective_sequence" >= 0),
    CONSTRAINT "character_beliefs_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "character_beliefs_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "character_beliefs_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "roadmaps" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roadmaps_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "roadmaps_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "roadmaps_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "roadmaps_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "arcs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "roadmap_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "arcs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "arcs_ordinal_check" CHECK ("ordinal" >= 0),
    CONSTRAINT "arcs_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "arcs_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "arcs_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "arcs_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "arc_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "narrative_sequence" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chapters_ordinal_check" CHECK ("ordinal" >= 0),
    CONSTRAINT "chapters_narrative_sequence_check" CHECK ("narrative_sequence" >= 0),
    CONSTRAINT "chapters_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "chapters_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "chapters_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "chapters_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE TABLE "beats" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "narrative_sequence" INTEGER NOT NULL,
    "accepted_prose_version_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "beats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "beats_ordinal_check" CHECK ("ordinal" >= 0),
    CONSTRAINT "beats_narrative_sequence_check" CHECK ("narrative_sequence" >= 0),
    CONSTRAINT "beats_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "beats_schema_version_check" CHECK ("schema_version" > 0),
    CONSTRAINT "beats_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "beats_project_id_id_key" UNIQUE ("project_id", "id")
);

CREATE INDEX "projects_owner_user_id_idx" ON "projects" ("owner_user_id");
CREATE INDEX "projects_status_idx" ON "projects" ("status");
CREATE INDEX "projects_owner_active_idx" ON "projects" ("owner_user_id", "created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "intake_sessions_project_id_status_idx" ON "intake_sessions" ("project_id", "status");
CREATE INDEX "intake_messages_project_id_intake_session_id_sequence_idx" ON "intake_messages" ("project_id", "intake_session_id", "sequence");
CREATE INDEX "concept_sets_project_id_created_at_idx" ON "concept_sets" ("project_id", "created_at");
CREATE INDEX "concepts_project_id_concept_set_id_ordinal_idx" ON "concepts" ("project_id", "concept_set_id", "ordinal");
CREATE INDEX "characters_project_id_display_name_active_idx" ON "characters" ("project_id", "display_name") WHERE "deleted_at" IS NULL;
CREATE INDEX "character_states_fold_idx" ON "character_states" ("project_id", "character_id", "effective_sequence" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "character_beliefs_fold_idx" ON "character_beliefs" ("project_id", "character_id", "belief_key", "effective_sequence" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "roadmaps_project_id_active_idx" ON "roadmaps" ("project_id", "created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX "arcs_project_id_roadmap_id_idx" ON "arcs" ("project_id", "roadmap_id");
CREATE UNIQUE INDEX "arcs_roadmap_id_ordinal_active_key" ON "arcs" ("roadmap_id", "ordinal") WHERE "deleted_at" IS NULL;
CREATE INDEX "chapters_project_id_arc_id_idx" ON "chapters" ("project_id", "arc_id");
CREATE UNIQUE INDEX "chapters_arc_id_ordinal_active_key" ON "chapters" ("arc_id", "ordinal") WHERE "deleted_at" IS NULL;
CREATE INDEX "chapters_project_id_narrative_sequence_idx" ON "chapters" ("project_id", "narrative_sequence");
CREATE INDEX "beats_project_id_chapter_id_idx" ON "beats" ("project_id", "chapter_id");
CREATE UNIQUE INDEX "beats_chapter_id_ordinal_active_key" ON "beats" ("chapter_id", "ordinal") WHERE "deleted_at" IS NULL;
CREATE INDEX "beats_project_id_narrative_sequence_idx" ON "beats" ("project_id", "narrative_sequence");

ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "intake_messages" ADD CONSTRAINT "intake_messages_project_id_intake_session_id_fkey" FOREIGN KEY ("project_id", "intake_session_id") REFERENCES "intake_sessions" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_sets" ADD CONSTRAINT "concept_sets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_project_id_concept_set_id_fkey" FOREIGN KEY ("project_id", "concept_set_id") REFERENCES "concept_sets" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "foundations" ADD CONSTRAINT "foundations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_project_id_character_id_fkey" FOREIGN KEY ("project_id", "character_id") REFERENCES "characters" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_beliefs" ADD CONSTRAINT "character_beliefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "character_beliefs" ADD CONSTRAINT "character_beliefs_project_id_character_id_fkey" FOREIGN KEY ("project_id", "character_id") REFERENCES "characters" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_project_id_roadmap_id_fkey" FOREIGN KEY ("project_id", "roadmap_id") REFERENCES "roadmaps" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_arc_id_fkey" FOREIGN KEY ("project_id", "arc_id") REFERENCES "arcs" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beats" ADD CONSTRAINT "beats_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "beats" ADD CONSTRAINT "beats_project_id_chapter_id_fkey" FOREIGN KEY ("project_id", "chapter_id") REFERENCES "chapters" ("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
