# W1.1 Schema Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyediakan tepat 48 tabel Lampiran B—5 tabel M0 kompatibel dan 43 tabel W1.1 baru—melalui empat migration expand-only, raw constraints/index, fixture N-1, dan schema tests PostgreSQL 16.

**Architecture:** `prisma/schema.prisma` menjadi model logical tunggal. Empat migration SQL per domain memegang partial unique, composite FK, named CHECK, dan partial indexes yang tidak dapat direpresentasikan Prisma. Testcontainers menyediakan PostgreSQL 16 terisolasi; migration runners memverifikasi empty, N-1 upgrade, expand-only, inventory, dan drift.

**Tech Stack:** Node.js, TypeScript, pnpm, Prisma 7.9, PostgreSQL 16, pg, Vitest, Testcontainers.

---

## Task 1: Schema test harness dan failing contracts

**Files:**
- Create: `packages/db/src/schema-test/harness.ts`
- Create: `packages/db/src/schema-test/fixtures.ts`
- Create: `packages/db/src/schema-test/schema-inventory.integration.test.ts`
- Create: `packages/db/src/schema-test/planning.integration.test.ts`
- Create: `packages/db/src/schema-test/soft-delete-unique.integration.test.ts`
- Create: `packages/db/src/schema-test/prose-fk.integration.test.ts`
- Create: `packages/db/src/schema-test/proposal-ai-jobs.integration.test.ts`
- Create: `packages/db/src/schema-test/credit-validation-ops.integration.test.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/src/auth/auth.integration.test.ts`

- [ ] Tambah `test:schema` dan Testcontainers harness PostgreSQL 16. Local tanpa Docker mencetak skip eksplisit; `CI=true` wajib gagal.
- [ ] Migrasikan auth integration test dari shared `TEST_DATABASE_URL` ke database terisolasi.
- [ ] Tulis inventory contract exact list `48 = 5 M0 + 43 W1.1` dan assertions kolom/enum M0.
- [ ] Tulis planning tenant-FK dan CHECK contracts dengan SQLSTATE `23503`/`23514`.
- [ ] Tulis `soft-delete-unique`: duplikat active fact gagal `23505`, tombstone membebaskan key, tenant lain independen.
- [ ] Tulis `prose-fk`: prose beat sendiri diterima; cross-beat/cross-project gagal `23503`; delete accepted prose `NO ACTION` sampai pointer dibersihkan.
- [ ] Tulis proposal/jobs tests untuk status, fence, workflow invocation unique, exact claim/lease/belief indexes.
- [ ] Tulis credit/validation/publish/outbox tests untuk amount/hash/payload/status, global dedupe, receipt unique, dan retention.
- [ ] Jalankan `pnpm --filter @narraza/db test:schema`; expected gagal karena tabel W1.1 belum ada.
- [ ] Commit: `test(db): define W1.1 schema contracts`.

## Task 2: Planning schema dan migration (13 tabel)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722090000_planning_expand/migration.sql`

- [ ] Tambah model `Project`, `IntakeSession`, `IntakeMessage`, `ConceptSet`, `Concept`, `Foundation`, `Character`, `CharacterState`, `CharacterBelief`, `Roadmap`, `Arc`, `Chapter`, `Beat`.
- [ ] Pertahankan lima model dan physical names M0 tanpa rename/drop/retype.
- [ ] Tambah direct `project_id`, parent `UNIQUE(project_id,id)`, composite tenant FK, `CASCADE` content, owner `RESTRICT`.
- [ ] Tambah named lifecycle/revision/sequence/hash/schema-version/payload CHECK.
- [ ] Tambah partial active uniques untuk arc/chapter/beat ordinal.
- [ ] Tambah exact `character_beliefs_fold_idx` pada `(project_id,character_id,belief_key,effective_sequence DESC,created_at DESC,id DESC)`.
- [ ] Tambah metadata header `W1.1`, `expand-only`, prerequisite, lock profile, backfill, verification, `forward-fix`.
- [ ] Jalankan `prisma validate`, generate, dan planning tests; expected pass.
- [ ] Commit: `feat(db): add planning expand migration`.

## Task 3: Knowledge/prose schema dan migration (8 tabel)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722091000_knowledge_prose_expand/migration.sql`

- [ ] Tambah `Fact`, `FactDisclosure`, `ReaderFactState`, `Reveal`, `RevealBreadcrumb`, `ProseVersion`, `ProseWorkingDraft`, `ProseEvidence`.
- [ ] Tambah exact partial unique facts `(project_id,fact_key) WHERE deleted_at IS NULL`.
- [ ] Tambah active working-draft partial unique `(project_id,user_id,beat_id)`.
- [ ] Tambah content hash, UTF-16 offset, disclosure/retraction, lifecycle, revision, payload CHECK.
- [ ] Tambah `UNIQUE (project_id,beat_id,id)` pada prose versions.
- [ ] Tambah accepted prose FK `beats(project_id,id,accepted_prose_version_id)` menuju `prose_versions(project_id,beat_id,id)` dengan `NO ACTION` delete.
- [ ] Tambah metadata expand-only; audit file tidak memuat destructive DDL.
- [ ] Jalankan focused `soft-delete-unique` dan `prose-fk`; expected pass.
- [ ] Commit: `feat(db): add knowledge and prose expand migration`.

## Task 4: Proposal/AI/jobs schema dan migration (13 tabel)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722092000_proposal_ai_jobs_expand/migration.sql`

- [ ] Tambah 13 model proposal/canon, snapshot/AI, dan jobs dari schema matrix spec.
- [ ] Gunakan typed project ownership, lifecycle, hash, ordinal, fence, lease, amount, dan JSON payload fields.
- [ ] Tambah deferred circular pointers hanya setelah target table tersedia.
- [ ] Tambah unique `(job_id,stage_key)`.
- [ ] Tambah queued claim partial index `(available_at,priority DESC,created_at,id) WHERE status='queued'`.
- [ ] Tambah expired running lease partial index `(lease_expires_at,id) WHERE status='running'`.
- [ ] Tambah metadata expand-only dan audit destructive DDL.
- [ ] Jalankan proposal/AI/jobs focused tests; expected pass.
- [ ] Commit: `feat(db): add proposal AI jobs expand migration`.

## Task 5: Credit/validation/publish/ops schema dan migration (9 tabel)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722093000_credit_validation_publish_ops_expand/migration.sql`

- [ ] Tambah `CreditLedgerEntry` mapped ke `credit_ledger`, `CreditReservation`, `CreditQuote`, `ValidationReport`, `ValidationFinding`, `ArtifactProposal`, `PublishArtifact`, `OutboxEvent`, `OutboxReceipt`.
- [ ] Pertahankan `AuditEvent` M0; jangan buat model/tabel pengganti.
- [ ] Tambah global ledger/outbox dedupe, receipt generation unique, money/status/hash/payload/coherence CHECK.
- [ ] Pastikan ledger/usage/audit/outbox tidak cascade pada project purge.
- [ ] Tambah metadata expand-only dan audit destructive DDL.
- [ ] Jalankan focused credit/validation/ops dan inventory tests; expected 48 tables dan semua pass.
- [ ] Commit: `feat(db): complete W1.1 expand migrations`.

## Task 6: Fixture N-1 dan migration verifiers

**Files:**
- Create: `packages/db/test/fixtures/m0-n-1.sql`
- Create: `packages/db/scripts/verify-schema-inventory.mjs`
- Create: `packages/db/scripts/verify-m0-upgrade.mjs`
- Create: `packages/db/scripts/test-migrations.mjs`
- Create: `packages/db/scripts/assert-expand-only.mjs`
- Modify: `packages/db/package.json`
- Modify: `package.json`

- [ ] Buat fixed-time M0 fixture: 2 users, 2 sessions, 4 email tokens, 1 rate counter, 1 audit event, memakai physical names dan enum M0 persis.
- [ ] Buat exact inventory verifier yang menolak missing/extra table dan mencetak `PASS 48 tables = 5 M0 + 43 W1.1`.
- [ ] Buat upgrade verifier yang memeriksa row/value/index/enum M0 tetap utuh.
- [ ] Buat expand-only scanner yang menolak DROP, RENAME, narrowing type, dan memverifikasi metadata empat migration.
- [ ] Buat Testcontainers PostgreSQL 16 runner mode empty, upgrade, all; error container selalu gagal.
- [ ] Tambah root/package scripts `migration:empty`, `migration:upgrade`, `migration:expand-only`, `migration:all`.
- [ ] Jalankan seluruh mode; expected pass.
- [ ] Commit: `test(db): verify empty and N-1 migrations`.

## Task 7: Drift dan CI

**Files:**
- Modify: `scripts/check-migration-drift.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/verification-matrix.md`

- [ ] Perketat drift checker: migration-to-DB dan schema-to-DB SQL output harus kosong; non-empty diff gagal.
- [ ] Integration CI jalankan Testcontainers dengan `CI=true`, tanpa silent skip.
- [ ] Migration CI jalankan expand-only, empty, N-1 upgrade, deploy, dan drift pada PostgreSQL 16.
- [ ] Pertahankan required job name kompatibel `Migration (empty + drift)` bila branch protection menuntut exact name; gunakan named steps untuk upgrade.
- [ ] Tambah verification matrix rows untuk inventory, expand-only, tenant FK, CHECK SQLSTATE, dan retention.
- [ ] Jalankan format check dan migration suite; expected pass.
- [ ] Commit: `ci: verify W1.1 schema migrations`.

## Task 8: Full verification dan scope audit

- [ ] Run `pnpm db:generate`.
- [ ] Run `CI=true pnpm --filter @narraza/db test:schema`; no skipped tests.
- [ ] Run `CI=true pnpm --filter @narraza/db test:integration`; all pass.
- [ ] Run `CI=true pnpm migration:all`; inventory, empty, upgrade, expand-only pass.
- [ ] Run drift against migrated PostgreSQL 16; output empty.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:unit`; all exit 0.
- [ ] Verify exact 48 table list, no 49th table, no edits to M0 migration.
- [ ] Scan W1.1 files for `TBD|TODO|FIXME|placeholder`; no output.
- [ ] Verify diff contains no W1.2+, repository, use case, worker runtime, API, or UI.
- [ ] Run `git diff --check` and `git status --short`; clean after final commit.
- [ ] Commit final generated/verification fixes only if files changed: `test(db): complete W1.1 schema verification`.
