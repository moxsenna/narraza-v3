# W1.1 Schema Core — Design Specification

**Tanggal:** 22 Juli 2026  
**Status:** Disetujui untuk implementasi W1.1  
**Scope:** schema Prisma, raw SQL constraints/index, migrasi expand-only, fixture N-1, CI migration, dan integration tests level schema.

## 1. Sumber kebenaran

Urutan konflik:

1. `docs/DECISIONS.md`
2. `docs/narraza-v3-prd-rilis-1.md`
3. `docs/verification-matrix.md`
4. `docs/narraza-v3-design-spec.md`, khususnya S2
5. `docs/implementation-plan.md`, khususnya W1.1 dan Lampiran B

Lampiran B berisi **48 tabel**, bukan 49. Lima tabel M0 sudah ada (`users`, `sessions`, `email_action_tokens`, `rate_limit_counters`, `audit_events`); W1.1 menambah **43 tabel**. Tidak ada tabel tambahan di luar Lampiran B.

## 2. Keputusan desain

- Implementasi bersifat **contract-first lengkap**: seluruh 48 tabel Lampiran B tersedia setelah W1.1, tetapi hanya kolom yang didukung kontrak domain atau dibutuhkan untuk ownership, relasi, lifecycle, CAS, ordering, dedupe, uang, hash, dan retention yang dibuat typed.
- Empat migrasi baru, berurutan dan expand-only:
  1. `planning_expand`
  2. `knowledge_prose_expand`
  3. `proposal_ai_jobs_expand`
  4. `credit_validation_publish_ops_expand`
- Lima tabel M0 dipertahankan kompatibel. W1.1 tidak rename/drop kolom, enum, constraint, atau index M0.
- Semua row milik project menyimpan `project_id` langsung. Relasi parent-child sesama project memakai composite FK `(project_id, parent_id)` menuju `UNIQUE (project_id, id)` pada parent.
- Content milik project memakai `ON DELETE CASCADE`. Pointer opsional memakai `ON DELETE SET NULL` bila PostgreSQL mengizinkan bentuk FK tersebut. Data finansial/audit/outbox immutable memakai `RESTRICT` atau tidak memiliki owner FK agar purge tidak menghapus bukti.
- Payload berversi memakai `jsonb`; ownership, FK, status, revision, sequence/order, claim fields, dedupe key, amount, dan hash tetap typed.
- Lifecycle baru yang dinyatakan S2 memakai `text` + named raw `CHECK`, bukan PostgreSQL enum, supaya penambahan status tetap expand-only.
- Timestamp operasional memakai `timestamptz` dan default PostgreSQL `NOW()`.
- ID tetap `text`, dibuat server.

## 3. Konvensi fisik

- Nama tabel/kolom snake_case melalui `@@map`/`@map` Prisma.
- Setiap tabel ber-ID memakai `id text PRIMARY KEY`.
- Setiap target composite FK project-owned memiliki `UNIQUE (project_id, id)`.
- Mutable row memakai `revision integer NOT NULL DEFAULT 0` dengan `CHECK (revision >= 0)`.
- Sequence, ordinal, priority, fence version, dan token counts yang tidak boleh negatif memiliki named `CHECK (... >= 0)`.
- SHA-256 wajib cocok `^[0-9a-f]{64}$`; nullable hash memakai `IS NULL OR`.
- JSONB payload wajib object dan memiliki `schema_version integer CHECK (schema_version > 0)`.
- Nilai uang disimpan sebagai `bigint` micro-IDR. Nilai kuantitas nonnegatif memakai `CHECK (value >= 0)`; ledger entry memakai amount positif dan type/direction menentukan efek saldo.
- Semua FK dan hot-path memiliki index pendukung eksplisit.

## 4. Soft delete

Soft delete hanya untuk user-facing canon:

- `projects`
- `characters`
- `facts`
- `roadmaps`
- `arcs`
- `chapters`
- `beats`
- `prose_working_drafts`

Active logical uniqueness memakai partial unique `WHERE deleted_at IS NULL`; Prisma schema tidak menambahkan `@@unique` yang bertentangan.

Constraint wajib facts:

```sql
CREATE UNIQUE INDEX facts_project_fact_key_active_key
ON facts (project_id, fact_key)
WHERE deleted_at IS NULL;
```

## 5. Schema matrix — 48 tabel

Kolom `id`, `created_at`, dan `updated_at` dicantumkan hanya bila perilakunya khusus. `sv/payload` berarti `schema_version integer` + `payload jsonb` tervalidasi.

### 5.1 Identity dan auth — existing M0 (4)

| # | Tabel | Kontrak W1.1 |
|---|---|---|
| 1 | `users` | Pertahankan `email`, `password_hash`, `status`, `email_verified_at`, `ui_mode`, `tier`, timestamp, enum dan unique M0. Tidak rename menjadi `email_normalized`; tombstone account tetap lewat status/email anonymization pada workstream purge. |
| 2 | `sessions` | Pertahankan `session_token`, `user_id`, expiry/absolute expiry, activity, revoke, FK M0. |
| 3 | `email_action_tokens` | Pertahankan `purpose`, `token_hash`, expiry/consume/revoke dan FK M0. |
| 4 | `rate_limit_counters` | Pertahankan `kind`, `key_hash`, `window_starts_at`, `count`, `expires_at`, unique dan index M0. |

### 5.2 Project dan planning (13)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 5 | `projects` | `owner_user_id`, `title`, `intake_path`, `status`, `current_canonical_version`, `revision`, `deleted_at`, timestamps | Owner FK `RESTRICT`; status/version/revision CHECK; owner-active and status indexes. |
| 6 | `intake_sessions` | `project_id`, `status`, `signal_count`, sv/payload | Project `CASCADE`; UQ `(project_id,id)`; status/count CHECK; project-status index. |
| 7 | `intake_messages` | `project_id`, `intake_session_id`, `role`, `sequence`, `content`, optional `job_id` | Composite session FK `CASCADE`; UQ session sequence; role/sequence CHECK; ordered index. Job FK ditambah setelah jobs tersedia. |
| 8 | `concept_sets` | `project_id`, optional `source_job_id`, `status`, `dependency_hash`, sv/payload | Project `CASCADE`; UQ tenant ID; status/hash CHECK; project-created index. Job FK ditambah setelah jobs tersedia. |
| 9 | `concepts` | `project_id`, `concept_set_id`, `ordinal`, `title`, `synopsis`, sv/payload | Composite set FK `CASCADE`; UQ set ordinal; ordinal CHECK/index. |
| 10 | `foundations` | `project_id`, `status`, `revision`, `confirmed_at`, `locked_at`, sv/payload | UQ project; project `CASCADE`; lifecycle/revision/timestamp CHECK. |
| 11 | `characters` | `project_id`, `display_name`, `role`, `revision`, sv/payload, `deleted_at` | Project `CASCADE`; UQ tenant ID; active-name lookup index; revision CHECK. |
| 12 | `character_states` | `project_id`, `character_id`, `effective_sequence`, optional `prose_version_id`, sv/payload | Composite character FK `CASCADE`; tenant ID UQ; append-only fold index. Prose FK ditambah setelah prose tersedia. |
| 13 | `character_beliefs` | `project_id`, `character_id`, `belief_key`, `effective_sequence`, optional `reason_code`, sv/payload | Composite character FK `CASCADE`; exact belief-fold index `(project_id, character_id, belief_key, effective_sequence DESC, created_at DESC, id DESC)`. |
| 14 | `roadmaps` | `project_id`, `title`, `revision`, sv/payload, `deleted_at` | Project `CASCADE`; active lookup; revision CHECK. |
| 15 | `arcs` | `project_id`, `roadmap_id`, `ordinal`, `title`, `revision`, sv/payload, `deleted_at` | Composite roadmap FK `CASCADE`; partial UQ active roadmap ordinal. |
| 16 | `chapters` | `project_id`, `arc_id`, `ordinal`, `title`, `narrative_sequence`, `revision`, sv/payload, `deleted_at` | Composite arc FK `CASCADE`; partial UQ active arc ordinal; narrative position index. |
| 17 | `beats` | `project_id`, `chapter_id`, `ordinal`, `narrative_sequence`, optional `accepted_prose_version_id`, `revision`, sv/payload, `deleted_at` | Composite chapter FK `CASCADE`; partial UQ active chapter ordinal; accepted-prose composite FK ditambah setelah prose table. |

### 5.3 Knowledge dan reveal (5)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 18 | `facts` | `project_id`, `fact_key`, `canon_status`, `visibility`, `revision`, sv/payload, `deleted_at` | Project `CASCADE`; exact partial UQ `(project_id,fact_key)` active; status/visibility/revision CHECK. |
| 19 | `fact_disclosures` | `project_id`, `fact_id`, optional `prose_version_id`, `event_type`, `effective_sequence`, optional `retracts_disclosure_id`, optional `evidence_id` | Composite fact FK `CASCADE`; disclosure self-FK `RESTRICT`; event/retraction coherence CHECK; fold index. Deferred prose/evidence FKs added after tables exist. |
| 20 | `reader_fact_states` | `project_id`, `fact_id`, `as_of_sequence`, `state`, `source_disclosure_id` | UQ project/fact; composite FKs; state/sequence CHECK; derived fold row. |
| 21 | `reveals` | `project_id`, `fact_id`, `chapter_id`, optional `beat_id`, `target_sequence`, `revision`, sv/payload | Composite fact/chapter FKs; optional beat pointer; target index; no duplicate truth text. |
| 22 | `reveal_breadcrumbs` | `project_id`, `reveal_id`, `chapter_id`, optional `beat_id`, `sequence`, sv/payload | Composite reveal/chapter FKs; UQ reveal sequence; ordered index. |

### 5.4 Prose (3)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 23 | `prose_versions` | `project_id`, `beat_id`, optional `source_candidate_id`, `status`, `revision`, `content`, `content_hash` | Composite beat FK `CASCADE`; UQ `(project_id,beat_id,id)` and `(project_id,id)`; immutable lifecycle/hash CHECK; beat-created index. Candidate FK deferred. |
| 24 | `prose_working_drafts` | `project_id`, `beat_id`, `user_id`, `revision`, `content`, `content_hash`, `deleted_at` | Composite beat FK `CASCADE`; user `RESTRICT`; partial UQ active `(project_id,user_id,beat_id)`; CAS/hash CHECK. |
| 25 | `prose_evidence` | `project_id`, `prose_version_id`, `start_utf16`, `end_utf16`, `content_hash`, `evidence_type`, sv/payload | Composite prose FK `CASCADE`; offsets CHECK `0 <= start_utf16 AND start_utf16 <= end_utf16`; prose-offset index. |

Accepted prose invariant:

```sql
ALTER TABLE beats
ADD CONSTRAINT beats_accepted_prose_belongs_to_beat_fkey
FOREIGN KEY (project_id, id, accepted_prose_version_id)
REFERENCES prose_versions (project_id, beat_id, id)
ON DELETE SET NULL;
```

Migration membuat prose tables dahulu, lalu menambah FK dengan `ALTER TABLE`. Nilai null tetap sah sebelum accept.

### 5.5 Proposal dan canon (5)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 26 | `proposal_groups` | `project_id`, `kind`, `status`, `dependency_hash`, optional `source_job_id` | Project `CASCADE`; status/hash CHECK; pending-project index; job FK deferred. |
| 27 | `proposals` | `project_id`, `group_id`, `change_set_id`, `source`, `status`, `operations_hash`, `dependency_hash`, optional revalidation/report pointers | Composite group/change-set FKs; lifecycle/source/hash CHECK; group/status and project-pending indexes. |
| 28 | `generated_candidates` | `project_id`, `group_id`, optional `job_id`, `ordinal`, optional `prose_version_id`, sv/payload | Composite group FK; UQ group ordinal; optional pointers; ordinal CHECK. |
| 29 | `canonical_change_sets` | `project_id`, `origin`, `status`, `base_canonical_version`, `operations_hash`, optional `applied_canonical_version` | Project `CASCADE`; status/origin/version/hash CHECK; project-status index. |
| 30 | `canonical_change_operations` | `project_id`, `change_set_id`, `ordinal`, `operation_type`, target entity fields, optional `expected_revision`, `risk`, sv/payload | Composite change-set FK `CASCADE`; UQ change-set ordinal; revision/risk CHECK; target index. |

### 5.6 Snapshot dan AI (5)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 31 | `context_snapshots` | `project_id`, `packet_kind`, `data_class`, `dependency_hash`, `content_hash`, sv/payload | Project `CASCADE`; packet/data-class/hash CHECK; dependency index; immutable. |
| 32 | `generation_context_bundles` | `project_id`, `snapshot_id`, `dependency_hash`, `bundle_hash`, `expires_at`, optional `consumed_at`, sv/payload | Composite snapshot FK `CASCADE`; UQ project/bundle hash; unconsumed-expiry index. |
| 33 | `ai_workflow_plans` | `project_id`, `bundle_id`, `workflow_kind`, `plan_hash`, `estimated_max_micro_idr`, sv/payload | Composite bundle FK; UQ project/plan hash; hash/money CHECK. |
| 34 | `model_price_snapshots` | provider/model IDs, input/output micro-IDR rates, currency, `effective_at`, sv/payload | Global immutable; UQ provider/resolved model/effective time; nonnegative rates CHECK. |
| 35 | `ai_usage_events` | optional scalar project/job/attempt attribution, price snapshot, token usage, provider cost, charged party, `dedupe_key` | Global UQ dedupe; price `RESTRICT`; usage/cost CHECK; immutable. Project attribution does not cascade. |

### 5.7 Jobs (3)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 36 | `generation_jobs` | `project_id`, `kind`, `status`, `priority`, `available_at`, lease fields, `fence_version`, optional cancel/retry/bundle/plan/reservation pointers | Project `CASCADE`; lifecycle/lease/fence CHECK; queued partial claim index `(available_at, priority DESC, created_at, id) WHERE status='queued'`; expired-running lease partial index. |
| 37 | `generation_attempts` | `project_id`, `job_id`, `invocation_id`, `ordinal`, `status`, optional provider request/result hash, start/finish, sv/payload | Composite job/invocation FKs; UQ invocation ordinal; lifecycle/hash CHECK; unfinished index. |
| 38 | `workflow_invocations` | `project_id`, `job_id`, `stage_key`, `status`, optional `winner_attempt_id`, `fence_version` | Composite job FK; UQ `(job_id,stage_key)`; winner pointer added after attempts; lifecycle/fence CHECK. |

Deferred pointers from planning/proposal/snapshot/prose to jobs/candidates are added in this migration after both targets exist. Ownership FKs remain composite.

### 5.8 Credit (3)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 39 | `credit_ledger` | optional scalar user/project/reservation/attempt attribution, `entry_type`, `direction`, `amount_micro_idr`, `dedupe_key` | Global UQ `dedupe_key`; append-only; amount positive; type/direction coherence CHECK; no cascading owner FK. |
| 40 | `credit_reservations` | `user_id`, optional scalar `project_id`/`job_id`, status, reserved/settled/released/exposure amounts, optional `closing_at` | User `RESTRICT`; financial lifecycle/amount/coherence CHECK; closing partial index; retained after project purge. |
| 41 | `credit_quotes` | `user_id`, optional scalar `project_id`, workflow plan ID/hash bindings, dependency hash, max amount, expiry/consume/request fields | User/plan `RESTRICT`; partial UQ request ID; money/hash CHECK; unconsumed-expiry index. |

### 5.9 Validation (2)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 42 | `validation_reports` | `project_id`, `prose_version_id`, `prose_content_hash`, `policy_version`, `status`, `passed`, sv/payload | Composite prose FK `CASCADE`; UQ prose/hash/policy; lifecycle/hash CHECK. |
| 43 | `validation_findings` | `project_id`, `report_id`, source/severity/rule/message, optional evidence and override fields, sv/payload | Composite report FK; optional evidence pointer; source/severity/override CHECK; report severity index. |

### 5.10 Publish (2)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 44 | `artifact_proposals` | `project_id`, `prose_version_id`, `status`, `dependency_hash`, optional source job, sv/payload | Composite prose FK; lifecycle/hash CHECK; project-status index. |
| 45 | `publish_artifacts` | `project_id`, `artifact_proposal_id`, `prose_version_id`, `artifact_type`, `content_hash`, sv/payload | Composite proposal/prose FKs; UQ proposal/type; hash/type CHECK; immutable non-canon. |

### 5.11 Ops (3; `audit_events` existing M0)

| # | Tabel | Typed contract | Keys/FK/index/delete |
|---|---|---|---|
| 46 | `audit_events` | Pertahankan kolom M0 `user_id`, `action`, `entity_type`, `entity_id`, `metadata`, `created_at`. W1.1 boleh menambah index additive, tidak rename/drop. Tidak ada owner FK agar audit bertahan. |
| 47 | `outbox_events` | aggregate fields, event type, `dedupe_key`, occurred time, sv/payload | Global UQ dedupe; no owner FK; immutable. |
| 48 | `outbox_receipts` | `outbox_event_id`, `consumer_key`, `delivery_generation`, status, lease/attempt timestamps, error code | Event FK; UQ event/consumer/generation; status/generation CHECK; consumer-status/retry index. |

## 6. FK dan delete policy

1. `projects` adalah tenant root dan tidak memiliki `project_id` sendiri.
2. Direct child memakai `project_id REFERENCES projects(id) ON DELETE CASCADE`.
3. Child bertingkat memakai composite FK `(project_id,parent_id)`.
4. Project content planning, knowledge, prose, proposal, snapshot, jobs, validation, dan publish mengikuti project `CASCADE`.
5. Pointer opsional memakai `SET NULL` hanya jika semua referencing columns yang perlu null memang nullable. Composite accepted-prose FK mempertahankan `project_id` dan `id`; implementasi harus memverifikasi PostgreSQL mendukung aksi yang dipilih. Bila column-subset `SET NULL` tidak dapat direpresentasikan aman, gunakan `NO ACTION` dan clear pointer eksplisit sebelum delete; invariant belonging-to-beat tetap wajib.
6. Ledger, AI usage, audit, dan outbox tidak ikut cascade. Attribution project/user disimpan sebagai scalar nullable atau FK `RESTRICT` sesuai kebutuhan retention.
7. Accepted prose version dibuat sebelum pointer beat diubah. Tidak perlu FK deferrable.

## 7. Migration topology dan metadata

| Urutan | Migration | Isi | Post-condition |
|---|---|---|---|
| 1 | `*_planning_expand` | 13 project/planning tables dan tenant constraints/index | DB M0 tetap valid; planning graph tersedia. |
| 2 | `*_knowledge_prose_expand` | 5 knowledge/reveal + 3 prose; partial uniques; accepted prose FK | Soft-delete fact dan prose ownership dijaga DB. |
| 3 | `*_proposal_ai_jobs_expand` | 5 proposal/canon + 5 snapshot/AI + 3 jobs; deferred pointers/index | Proposal/job persistence contract tersedia tanpa runtime worker. |
| 4 | `*_credit_validation_publish_ops_expand` | 3 credit + 2 validation + 2 publish + 2 outbox; additive audit indexes/checks bila perlu | Total tepat 48 tabel Lampiran B. |

Setiap migration SQL memiliki komentar metadata:

- migration ID dan UTC date;
- workstream `W1.1`;
- tujuan dan object yang ditambah;
- classification `expand-only`;
- prerequisite migration ID;
- lock profile;
- backfill (`none` atau langkah idempotent bila diperlukan);
- verification commands;
- rollback posture `forward-fix`.

Dilarang: `DROP`, rename, perubahan tipe menyempit, penghapusan enum/status M0, atau rewrite destruktif. Named constraints/index memakai nama stabil.

## 8. Fixture N-1 dan CI

Fixture N-1 adalah SQL untuk schema M0 terakhir dan memuat data sah representatif:

- user pending dan active;
- session active/revoked;
- verify/reset token active/consumed/revoked;
- rate-limit counter;
- audit event.

Fixture tidak memuat `projects`, karena projects baru lahir pada migration pertama W1.1.

CI PostgreSQL 16 menjalankan:

1. `migrate-empty`: database kosong menjalankan semua migration dan memverifikasi tepat 48 tabel aplikasi.
2. `migrate-upgrade`: schema M0 + fixture N-1 menjalankan empat migration dan memverifikasi seluruh data M0 utuh.
3. `prisma-migrate-diff`: schema Prisma terhadap database hasil migration; output wajib kosong.
4. Integration schema tests melalui Testcontainers dengan database/schema terisolasi per file.

Integration tests tidak boleh silent skip pada job CI. Local run boleh skip hanya dengan pesan eksplisit bila Docker tidak tersedia; CI harus fail bila Testcontainers tidak dapat start.

## 9. Test contract

Negative assertions memakai SQLSTATE, bukan pesan vendor:

- unique violation: `23505`
- foreign-key violation: `23503`
- check violation: `23514`

Test wajib:

### `soft-delete-unique`

1. Fact aktif pertama `(project A, key K)` berhasil.
2. Fact aktif duplikat pada project A gagal `23505`.
3. Key K pada project B berhasil.
4. Setelah fact pertama ditombstone, fact aktif baru dengan key K pada project A berhasil.
5. Beberapa tombstone boleh memiliki key sama.

### `prose-fk`

1. Beat A dan B dibuat pada project sama; beat C pada project lain.
2. Prose PA milik beat A dibuat.
3. A menerima PA berhasil.
4. B menerima PA gagal `23503`.
5. C menerima PA gagal `23503`.
6. Pointer null sah sebelum accept.
7. Delete behavior accepted prose mengikuti kebijakan final migration tanpa pernah meninggalkan pointer invalid.

### Contract tambahan

- Representative cross-tenant composite FK pada tiap migration menolak linkage dengan `23503`.
- Status ilegal, revision/sequence negatif, hash invalid, payload bukan object, dan amount ilegal gagal `23514`.
- Ledger dedupe global gagal `23505`, termasuk lintas user/project.
- Workflow invocation `(job_id,stage_key)` duplikat gagal `23505`.
- Query claim dan expired lease memakai index partial yang disepakati.
- Query belief fold memakai exact index dan total order.
- Project purge menghapus content; immutable financial/audit/outbox tetap ada atau delete diblokir sesuai FK.

## 10. Rollback posture

Migration W1.1 bersifat expand-only dan forward-fix. Tidak ada automatic down migration di production. Bila migration gagal sebelum commit, transaksi PostgreSQL rollback. Bila migration sudah commit tetapi app gagal, rollback artefak app selama metadata kompatibilitas mengizinkan dan pertahankan expanded schema. Koreksi schema dibuat sebagai migration expand baru.

Contract/drop baru boleh dilakukan di workstream terpisah setelah tidak ada reader/writer lama dan backup/restore tervalidasi.

## 11. Batas PR

Termasuk:

- Prisma schema untuk 48 tabel Lampiran B;
- empat migration expand-only;
- raw partial unique, composite FK, named CHECK, dan key indexes;
- fixture N-1 dan migrate-upgrade;
- drift check;
- integration tests `soft-delete-unique` dan `prose-fk` plus contract checks pendukung;
- CI migration update.

Tidak termasuk:

- W1.2–W1.5 policies, packets, validator, atau operation resolution;
- repository, ports, UnitOfWork, use case, worker runtime, credit engine runtime;
- API, Server Action, UI;
- collaboration, OAuth provider table, payment, import, atau fitur pasca-R1.

## 12. Acceptance criteria

- [ ] Total tepat 48 tabel Lampiran B: 5 existing M0 + 43 baru.
- [ ] Tidak ada rename/drop atau perubahan incompatible pada schema M0.
- [ ] Empat migration baru berurutan dan expand-only.
- [ ] Semua project-owned row menyimpan `project_id` langsung; parent linkage bertingkat memakai composite FK tenant-consistent.
- [ ] Delete behavior mengikuti klasifikasi content, pointer, dan immutable evidence.
- [ ] Delapan user-facing canon tables memakai `deleted_at`; active logical uniques memakai partial index.
- [ ] Facts memakai exact partial unique `(project_id,fact_key) WHERE deleted_at IS NULL`.
- [ ] JSONB berversi memiliki typed schema version dan payload-object CHECK.
- [ ] Status baru memakai text + named CHECK; revision/sequence/hash/amount dijaga CHECK.
- [ ] Prose versions unik `(project_id,beat_id,id)` dan accepted pointer tidak bisa menunjuk prose beat/project lain.
- [ ] Belief fold, queued claim, expired lease, ledger dedupe, dan workflow invocation index/unique tersedia.
- [ ] Fixture N-1 memuat data M0 dan upgrade menjaga data utuh.
- [ ] `migrate-empty`, `migrate-upgrade`, dan drift hijau pada PostgreSQL 16.
- [ ] Test schema memakai Testcontainers isolation dan SQLSTATE `23505`, `23503`, `23514`.
- [ ] Scope PR tetap W1.1.

## 13. Self-review

- Tidak ada `TBD`, `TODO`, placeholder keputusan, atau tabel inventif.
- Hitungan dikoreksi terhadap Lampiran B: 48 tabel, bukan 49.
- Lima tabel M0 dipertahankan sesuai `prisma/schema.prisma`; desain tidak mengganti nama kolom atau nilai enum M0.
- Fixture N-1 tidak mereferensikan tabel W1.1 sebelum migration.
- Accepted prose FK menjaga tenant dan beat sekaligus.
- Circular beat/prose dependency diselesaikan dengan create-table lalu `ALTER TABLE`.
- Status lifecycle baru memakai text + CHECK secara konsisten; enum M0 tetap dipertahankan.
- Scope terbatas pada kontrak DB W1.1.
