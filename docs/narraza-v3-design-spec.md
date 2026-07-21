# Narraza v3 — Design Specification (Rilis 1)

**Date:** 2026-07-18 (baseline) · 2026-07-21 (patch keputusan D1–D20)  
**Status:** LOCKED (S1–S10) + patch dari `DECISIONS.md` — siap untuk implementation plan  
**Product:** Narraza — AI Serial Fiction Production OS  
**Tagline:** Build long fiction without losing the plot.

> Perubahan 2026-07-21 ditandai **[D#]** dan dirinci di `docs/DECISIONS.md`. Bila ada konflik, DECISIONS.md menang.

---

## 0. Context & decisions

### 0.1 Why rebuild

Legacy monorepo (`vibenovel-unified-blueprint`) accumulated CF Workers complexity, broken core flows (concept gen charged without result, empty write room, credit desync, internal text leaks), and UX score ~4/10. ChatGPT scaffold at `Narraza Fix/narraza` had good domain contracts (Reveal Gate, Context Packet, proposal-before-canon) but was demo/stub-only (hardcoded Nadira, JSON store, no real AI).

**Decision:** greenfield codebase, brownfield knowledge. Port concepts and important tests as specification; do not copy runtime structure.

Audit UX produksi legacy (2 reviewer independen, 22 Jun 2026, `narraza old/narraza-ux-review-gabungan.md`) menjadi input formal: pemetaan temuan lama → mekanisme v3 ada di `DECISIONS.md` (tabel akhir). **[D1]**

### 0.2 Product constraints (user)

| Decision      | Choice                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------ |
| Scope rilis 1 | Core story flow only (no payment gateway)                                                  |
| Hosting       | VPS (no Cloudflare)                                                                        |
| Stack         | Next.js modular monolith + Postgres                                                        |
| AI            | Multi-provider + fallback (OpenRouter primary, Gemini fallback)                            |
| Auth          | Email magic link (custom two-step)                                                         |
| UX modes      | Guided + Advanced from day one (Advanced = controls that exist, not full power-user suite) |
| UI posture    | Modern SaaS (Notion/Linear)                                                                |
| Pain focus    | Continuity, generic prose, outline obedience, UX trust, simpler architecture               |

### 0.3 Marketing guardrails

Do **not** claim: one-click novel, no edit, 100% consistent, publish-ready without review.  
Do claim: guide, structure, consistency checks, mobile-friendly chapters, author remains decision-maker.

### 0.4 Out of scope rilis 1

Payment, KBM export, voice-lock learning, draft import, team collab, BYOK, full admin panel, Redis/BullMQ, streaming token UI, raw prompt editor, user model-ID picker.

---

## 1. Architecture & stack (S1 LOCKED)

### 1.1 Repo layout

```
narraza/
├── apps/
│   ├── web/                 Next.js 15 adapter (App Router, RSC, Server Actions)
│   ├── worker-gen/          generation job worker
│   └── worker-outbox/       outbox consumer worker
├── packages/
│   ├── core/                pure domain (no AI/DB/HTTP)
│   ├── application/         use cases + transaction orchestration
│   ├── ai/                  provider adapters, routing, prompts, parse
│   ├── db/                  Prisma repos implementing ports
│   └── shared/              DTOs, zod, env schemas, utils
├── prisma/
├── deploy/
└── docs/superpowers/specs/
```

### 1.2 Dependency direction

```
UI / Worker adapters
  → Application Service
      → Domain Core (pure)
      → Repository / AI / Ledger / Audit / Snapshot ports
  ← Prisma / OpenRouter / Gemini implement ports
```

Core never imports AI, Prisma, Next, or HTTP. Application depends on ports only. Web does not import Prisma. AI does not touch ledger or artifact storage.

### 1.3 Stack

| Layer       | Choice                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web         | Next.js App Router (versi stabil terbaru, pin di M0 **[D7]**), React, TS strict, Tailwind v4 + shadcn                                                                               |
| API surface | Server Actions + route handlers as adapters only                                                                                                                                    |
| DB          | Postgres 16 + Prisma ≥6 (pin di M0 **[D7]**)                                                                                                                                        |
| Auth        | Auth.js v5 sessions + Narraza custom passwordless; adapter di packages/db **[D8]**                                                                                                  |
| Email       | Resend (produksi) · Mailpit (dev/CI/e2e) **[D10]**                                                                                                                                  |
| AI          | packages/ai — OpenRouter + Gemini, capability contracts; model-policy allowlist **[D14]**                                                                                           |
| Jobs        | Postgres `generation_jobs` + lease (no Redis rilis 1)                                                                                                                               |
| Deploy      | VPS Ubuntu, nginx TLS, PM2 **2 proses: web + worker** (outbox consumer = modul dalam worker sampai ada channel eksternal; `apps/worker-outbox` tetap entrypoint terpisah) **[D11]** |
| Test        | Vitest, testcontainers, Playwright (desktop + viewport 375px **[D20]**)                                                                                                             |

Versi persis seluruh dependency dicatat di tabel ini saat M0; tidak ada upgrade major di tengah M1–M8 tanpa keputusan eksplisit. **[D7]**

#### 1.3.1 Versi persis (dipin di M0 — 2026-07-21)

Toolchain: Node ≥ 22 (dikembangkan di v24.15.0) · pnpm 11.9.0.

| Paket | Versi | Catatan |
| --- | --- | --- |
| `next` | 16.2.10 | + `eslint-config-next` 16.2.10 |
| `react` / `react-dom` | 19.2.7 | |
| `typescript` | **5.9.3** | ⚠️ **Bukan latest.** Latest stable = 7.0.2 (native compiler), tetapi `typescript-eslint` belum mendukung TS 7 (peer `typescript <6.1.0`; runtime error eksplisit — lihat typescript-eslint#10940). 5.9.3 = stable tertinggi yang didukung seluruh toolchain. **Revisit** saat typescript-eslint merilis dukungan TS 7. |
| `@prisma/client` / `prisma` | 7.9.0 | D7 minta ≥6 ✓ |
| `tailwindcss` / `@tailwindcss/postcss` | 4.3.3 | v4 CSS-first ✓ |
| `next-auth` | **5.0.0-beta.32** | ⚠️ Auth.js v5 masih kanal beta di tanggal pin; D7 eksplisit meminta v5. + `@auth/prisma-adapter` 2.11.3, `@auth/core` 0.41.3 |
| `zod` | 4.4.3 | |
| `vitest` | 4.1.10 | |
| `@playwright/test` | 1.61.1 | (ditambahkan saat harness e2e W0.4/W0.6) |
| `@testcontainers/postgresql` | 12.0.4 | (ditambahkan saat integration harness M1/M2) |
| `dependency-cruiser` | 18.1.0 | |
| `pino` | 10.3.1 | |
| `eslint` | 10.7.0 | flat config; + `@eslint/js` 10.0.1, `typescript-eslint` 8.65.0, `eslint-config-prettier` 10.1.5 |
| `prettier` | 3.9.6 | |
| `tsx` | 4.23.1 | runner worker dev |
| `@types/node` | 26.1.1 | · `@types/react` 19.2.17 · `@types/react-dom` 19.2.3 |

Dua deviasi dari "latest stable" (TypeScript & next-auth) diverifikasi nyata di M0: `pnpm install · typecheck · lint · arch · format · build (packages+web+workers) · test` seluruhnya hijau dengan kombinasi versi di atas.

### 1.4 Background work

Postgres job table + `FOR UPDATE SKIP LOCKED` + lease token/version fencing. Worker is separate Node process in same monorepo.

Parameter operasional (semua via env, default **[D12]**): lease job 60s; heartbeat perpanjang tiap 20s; reclaim sweeper 30s; polling status job UI 2,5s (backoff 10s); CreditQuote berlaku 10 menit; sweeper retensi bundle/quote tiap 1 jam (hapus umur >24 jam); poll outbox 1s (idle backoff 5s).

---

## 2. Data model & proposal/canon (S2 LOCKED)

### 2.1 Layers

| Layer      | Tables                                                                                                    | Mutability                          |
| ---------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Canon      | facts, characters, states, beliefs, reveals, outlines, chapters, beats, accepted prose pointer            | only via `commitCanonicalChangeSet` |
| Change set | CanonicalChangeSet, CanonicalChangeOperation                                                              | pending → applied/rejected/stale    |
| Proposal   | ProposalGroup, Proposal (source ai\|user\|system), GeneratedCandidate                                     | status transitions only             |
| Snapshot   | ContextSnapshot, GenerationContextBundle                                                                  | append-only                         |
| Audit/ops  | AuditEvent, OutboxEvent, CreditLedger, AIUsageEvent, GenerationJob, GenerationAttempt, WorkflowInvocation | mostly append-only                  |

### 2.2 Single write door

```
AI/user/system input
→ validate/normalize
→ CanonicalChangeSet (pending)
→ commitCanonicalChangeSet (one PG transaction)
→ canon + entity revisions + project.currentCanonicalVersion += 1
→ audit + outbox (+ ledger only if credit policy requires — not on accept for provider cost)
```

`AIProposal`/`Proposal` ≠ canon. Manual user edits use `origin=user`, not fake AI proposals.

### 2.3 Proposal lifecycle (terminal outcomes)

```
pending
→ accepted | rejected | stale | superseded | needs_revalidation
```

All outcomes terminal. Revalidation spawns **new** ProposalGroup + Proposal with `revalidatedFromProposalId`. Never reopen old proposal to pending.

Proposal validity is **dependency-based**, not driven by global version alone:

- dependency hash unchanged → proposal remains valid, even if unrelated `project.currentCanonicalVersion` bumps occurred
- relevant dependency changed → stale policy classifies:
  - `needs_revalidation` if the proposal may still be regenerated against current dependencies
  - `stale` if the proposal can no longer be safely applied

`project.currentCanonicalVersion` is an audit sequence. **Global canonical version alone never invalidates a proposal.**

### 2.4 Knowledge model

- **Global truth:** Fact (`FactCanonStatus`: confirmed | deprecated | contradicted). Rows exist only after applied change set.
- **CharacterBelief:** append-only streams keyed by `beliefKey`; current = latest `effectiveSequence <= target`.
- **CharacterState:** append-only snapshots per sequence.
- **Reader knowledge:** FactDisclosure events folded to ReaderFactState (not substring of prose).
- **Reveal:** points to `factId` (no duplicated truth string). Breadcrumbs separate table.

### 2.5 Prose

- `ProseVersion` = immutable artifact (`draft|validated|rejected|superseded`).
- `Beat.acceptedProseVersionId` = sole canonical pointer; composite FK `(beat_id, accepted_prose_version_id)`.
- Working draft (UI) is separate mutable row; snapshot creates new ProseVersion.

### 2.6 Credit

Append-only ledger + reservations:

```
bookBalance = grants - settlements + refunds ± adjustments
heldBalance = Σ (reserved - settled - released) including closing exposures
availableCredit = bookBalance - heldBalance
```

Types: grant | reserve | settle | release | refund | adjustment.  
Dedupe keys e.g. `settle:{reservationId}:{attemptId}`.  
Micro-IDR integers. No charge on proposal accept for provider cost (incurred at attempt).

**Kebijakan nol-potongan [D4]:** job yang berakhir tanpa hasil yang bisa dipakai (tidak ada kandidat/artefak dipublikasikan) → seluruh reservation di-release; potongan kredit pengguna = 0. Biaya provider yang sempat terjadi tetap dicatat di AIUsageEvent sebagai biaya sistem (bukan settlement ke ledger user). Settlement ke user hanya terjadi pada job yang menghasilkan output.

**Display kredit [D6]:** 1 kredit = `MICRO_IDR_PER_CREDIT` (konstanta server tunggal; default 10.000.000 micro-IDR = Rp10, dikalibrasi di M7). Pembulatan: saldo tersedia/book = floor; held/quote = ceil. Header dan halaman Kredit wajib memakai fungsi konversi yang sama atas snapshot yang sama.

**Aksi gratis vs berbayar [D4]:** chat intake Narra gratis untuk pengguna (fair-use default 60 balasan/hari, tetap melalui reservation dengan biaya sistem, tanpa kartu quote). Semua aksi generasi lain (konsep, fondasi, karakter, outline, beat write+judge, repair, publish package) berbayar dengan kartu CreditQuote + konfirmasi eksplisit.

### 2.7 Soft delete & purge

Partial unique indexes `WHERE deleted_at IS NULL`.  
Project/user: tombstone → retention → purge story content; retain anonymized ledger/security audit.  
Email tombstone: `deleted_{randomOpaqueId}@deleted.invalid` (not hash of email). Re-signup of same email allowed rilis 1.

### 2.8 Constraints

Enums via Prisma. Partial uniques, complex CHECKs, composite FKs via raw SQL migrations. No Prisma `@@unique` that fights soft-delete.

---

## 3. Domain core (S3 LOCKED)

### 3.1 Modules

```
packages/core/
  reveal-policy, expression-policy, knowledge-policy
  readiness-policy, dependency-manifest, stale-policy
  prose-policy, disclosure-policy, repair-policy
  context/{planner,writer,validator,repair,extraction}-packet
  validator/{structural,restricted-representation,merge-findings,scoring,contracts}
```

**readiness-policy [D5]:** Kesiapan Fondasi = checklist berbobot deterministik (konsep inti, tokoh utama + relasi, konflik, arah ending, janji pembaca, panggilan & gaya bicara, rahasia + jadwal). Persentase = Σ bobot unsur terpenuhi; kriteria "terpenuhi" per unsur terdefinisi di core; tanpa penilaian AI. Reducer yang sama menghasilkan %, checklist, dan satu rekomendasi berikutnya.

### 3.2 Packet types (discriminated unions, allowlist builders)

```
planner    → restricted
writer     → writer_safe   (no truth, no restrictedGuardSet, no future outlines)
validator  → restricted
repair     → writer_safe (sanitized directives only)
extraction → review_safe or restricted by use case
```

Writer guidance vs restricted guard set are **two views** from reveal policy. Raw forbidden concepts/truth never enter writer packet.

### 3.3 Expression vs knowledge

Character may know a fact but lack permission to state it. Non-POV gets behavioral directives, not raw beliefs.

### 3.4 NarrativePosition

`{ chapterId, beatId?, sequence }` — chronology is sequence, not display chapter number.

### 3.5 Validation

Deterministic matcher: exact/alias/co-occurrence/proximity → matched | suspected | requires_semantic_review.  
Does not claim full paraphrase coverage.  
AI findings only **add**; cannot remove/downgrade deterministic blockers.  
`passed = no blocking findings`.  
Public findings: `publicMessageCode` → i18n. Internal detail never to UI/repair.

### 3.6 Repair policy

Stop conditions OR: all_blocking_resolved | attempt_limit | no_progress | same_findings_repeated | regression.  
Repair produces new ProseVersion + new Proposal; never auto-accept.

### 3.7 Dependency hash

Canonical serialization + schema version prefix + SHA-256. Reject duplicate `(entityType, entityId)` entries.

---

## 4. Application services (S4 LOCKED)

### 4.1 UnitOfWork

```ts
unitOfWork.execute(async (tx) => { ... })                     // default: read committed + row lock/CAS
unitOfWork.execute(async (tx) => { ... }, { isolation: 'serializable' })  // hanya use case yang ditandai
```

**[D9]** Default `read committed` + `SELECT ... FOR UPDATE` eksplisit + CAS (menghindari retry storm pada hot row `project`). Serializable hanya untuk use case yang secara eksplisit membutuhkannya. Transaction-scoped ports only. Bounded retry pada serialization/lock failure: maks 3, backoff jitter, requestId sama.

### 4.2 Web command vs worker handler

**Never** call LLM in Server Action. Two phases (quote before reserve; plan before quote):

**Quote phase**

```
authorize → readiness → read canon
→ build frozen context bundle
→ build frozen AIWorkflowPlan
→ issue CreditQuote bound to:
   workflowPlanHash, dependencyHash, estimatedMaximumMicroIdr, expiry
```

**Confirmation phase**

```
confirm quoteId + requestId
→ revalidate owner, quote, dependency hash, balance
→ create jobId
→ reserve credit
→ create job referencing existing bundle + workflow plan
→ enqueue
```

Unused bundle/quote: retention sweeper.  
Worker: claim → stages with separate attempts → publish under lease fence.

### 4.3 Three-phase attempt (no open DB during LLM)

1. Tx: create attempt `started`
2. External provider call
3. Tx: finalize attempt + usage + settle exposure
4. CPU validate
5. Tx C: assert lease → candidates/proposals → job terminal effects

### 4.4 Atomic accept

Lock proposal + group + project; ownership; status guard; stale decision; supersede pre-check; eligibility from report; CAS ops; bump entity revisions; **project version +1 once**; accept + supersede siblings; audit/outbox.  
CAS fail / unique violation: **new transaction** conditional update `WHERE status='pending'`.

### 4.5 Authz

Every use case: `authorizeActiveUser` then tenant-scoped owned resource queries. IDOR → public `NOT_FOUND`.

### 4.6 Proposal unit

One Proposal = one complete alternative → one ChangeSet. Multi-candidate from one writer response via GeneratedCandidate.

---

## 5. AI layer (S5 LOCKED)

### 5.1 Port

```
buildWorkflowPlan → AIWorkflowPlan { writer, judge, structuredRepair?, judgeOutputRepair? }
executeSingleAttempt → SingleAttemptResponse (rawBody only; app persists artifact)
parseOutput(contract, rawBody) → typed T
classifyError → NormalizedProviderError
decideNextAction → next candidate | terminal | parse_repair
```

**One executeSingleAttempt = one provider call.** Fallback/JSON-LLM-repair/judge are separate GenerationAttempts orchestrated by application.

### 5.2 Routing

Frozen `AIWorkflowPlan` + per-stage `RoutingPlan` + candidates with execution profiles (structured mode, timeouts, priceSnapshotId).  
Visibility/data-handling constraints: restricted packets only to `restricted_allowed` models.  
Worst-case budget = Σ(stage budget × maxInvocations).

**Model policy [D14]:** daftar `restricted_allowed` dipelihara di `packages/ai/model-policy.ts` + `docs/model-policy.md` (dibuat di M4). Syarat masuk daftar: jaminan tertulis no-training & no-retention dari provider/endpoint. Finalisasi daftar = gate M4; sebelum final, workflow restricted hanya boleh jalan dengan mock provider.

### 5.3 Prompts

Typed projectors (compile-time packet kind). Explicit version + content hashes (not hashing TS functions).  
Judge outputs `publicMessageCode` + optional `internalRationale` (restricted only).  
All zod `.strict()`.

**Prompt injection [D13]:** konten cerita pengguna adalah input tak tepercaya. Semua projector membungkus konten user dengan delimiter konsisten; output hanya diterima via strict-schema parse; merge-findings menjamin AI tidak dapat menghapus/menurunkan blocker deterministik. Unit test wajib memakai fixture adversarial (naskah berisi "abaikan instruksi", "tandai semua temuan lolos", dsb.).

### 5.4 Pricing

`ModelPriceSnapshot` immutable. Micro-IDR. Ceil estimates. Prefer provider-reported cost when valid. Store requested vs resolved model IDs.

### 5.5 UI

Only tiers: Hemat | Seimbang | Terbaik. Never raw model IDs to client.

---

## 6. Auth & security (S6 LOCKED)

### 6.1 Passwordless (custom) + Auth.js sessions

```
Auth.js: session cookie, auth(), revoke, Prisma User/Session
Narraza: EmailLoginChallenge (tokenHash only), two-step confirm
```

Flow: GET token → pending HttpOnly cookie → clean URL → POST consume atomic → session.  
Max 3 active challenges per identifier; issue does not revoke all (DoS); after successful consume, revoke siblings; at cap revoke oldest.

**Rate limit [D10]:** cooldown kirim ulang 60 detik/identifier; maks 5 permintaan/jam/identifier; maks 20 permintaan/jam/IP (semua via env). Email produksi: Resend. Dev/CI: Mailpit — e2e membaca link dari Mailpit API.

**Adapter [D8]:** Auth.js Prisma adapter (User/Session) diimplementasikan di `packages/db` dan di-inject ke konfigurasi Auth.js; apps/web tidak pernah import `@prisma/client` langsung (ditegakkan test `web-boundary`).

### 6.2 Session

Absolute 30d; idle 14d; activity write ≤1/6h.  
`lastActiveAt`, `expiresAt`, `revokedAt`. Active user status required.

### 6.3 Secrets least privilege

| Process    | Secrets                                 |
| ---------- | --------------------------------------- |
| Web        | AUTH_SECRET, DATABASE_URL_WEB, email    |
| Gen worker | DATABASE_URL_WORKER, OpenRouter, Gemini |
| Outbox     | DATABASE_URL_OUTBOX + channel only      |

Peppers: `RATE_LIMIT_PEPPER`, `EMAIL_CHALLENGE_PEPPER` ≠ AUTH_SECRET.

### 6.4 Client data classes

`public | author_private | service_restricted | security | financial`  
Author may see own secrets; service_restricted never to browser.

### 6.5 Tombstone vs in-flight

Cancel queued; set cancelRequestedAt on running; worker checks before each stage; late cost via exposure; no proposal publish after cancel.

---

## 7. Prompt workflow & extraction (S7 LOCKED)

### 7.1 Three type layers

ModelSuggestionDraft → NormalizedOperationDraft → CanonicalChangeOperation (discriminated, strict).  
Model never emits CanonicalChangeOperation.

### 7.2 Resolution before persist

Allocate IDs, resolve tempRef within single GeneratedCandidate, DAG + topological sort, operationsHash.  
System-derived: operationId, targetId, revisions, risk, factKey, sequences, prose.accept.

### 7.3 Per-contract operation allowlists

beat.write / repair / outline / foundation / intake each have allowed ops + max counts.  
Repair: full re-extraction; no reuse old ops with new proseVersionId.

### 7.4 Evidence

ProseEvidence UTF-16 offsets + proseContentHash. Disclosures require evidence.  
`planner_only` facts forbidden from beat writer.

### 7.5 Publish package

ArtifactProposal only — does **not** bump canonical version.

### 7.6 Concept accept

→ foundation **draft**; confirm/lock is separate readiness gate.

### 7.7 ProseAcceptOperation last in beat DAG

All fact/state/belief/disclosure ops for that prose precede prose.accept.

---

## 8. Operational reliability (S8 LOCKED)

### 8.1 Job SM

```
queued → running | failed | dead | cancelled
running → queued (exec retry) | succeeded | failed | dead | cancelled
terminal immutable
```

CAS + fence. Manual retry = **new job** + `retryOfJobId`.

### 8.2 WorkflowInvocation

Per stage key; CAS select winner attempt; late successes pay cost but do not replace winner.

### 8.3 Reservation closing

Terminal job releases concurrency slot immediately.  
Unresolved attempts → reservation `closing`; only safeRelease; settle/release exposures then close.

### 8.4 Outbox

At-least-once + idempotent handlers. Receipt: processing | completed | uncertain | dead + deliveryGeneration.  
Replay dead = new generation, same dedupeKey/payload.

**Deploy R1 [D11]:** belum ada channel eksternal → consumer outbox berjalan sebagai modul terpisah di proses worker (bukan proses PM2 ketiga). `apps/worker-outbox` tetap entrypoint mandiri; pemisahan proses = perubahan konfigurasi PM2 saja saat channel eksternal pertama hadir.

### 8.6 Observability [D16]

Log JSON terstruktur (pino) di semua modul; tidak pernah memuat data `service_restricted`/`security`. Sweeper alert tiap 5 menit: job `dead` baru, reservation `closing` > 6 jam, outbox `dead`/`uncertain` > 1 jam. Rekonsiliasi ledger harian (book vs held vs exposure); selisih = alert. Notifikasi email ops. Dashboard penuh = pasca-R1.

### 8.5 Clocks

All operational timestamps from PostgreSQL `NOW()`, not Node clock.

---

## 9. UI & interaction (S9 LOCKED)

### 9.1 Shell

Modern SaaS: sidebar stages, top bar credit + tier, main, optional advanced panel. Mobile bottom nav.

### 9.2 Progress

`ProjectProgressView` backend reducer = single source for dashboard CTA, redirect, chips. No fake “writing” without job/prose.

### 9.3 Working draft + validation hash

Autosave CAS on ProseWorkingDraft. ValidationReport binds proseVersionId + contentHash. Stale after edit.

### 9.4 Jobs

PublicJobPhase labels (no fake %). Recover active jobs after refresh. JOB_ALREADY_ACTIVE returns activeJobId.

### 9.5 CreditQuote

Server-frozen quote issued **after** frozen AIWorkflowPlan (bound to `workflowPlanHash` + dependency hash); confirm with quoteId+requestId; expired/changed → reconfirm.  
CreditSummary: available / held / reconciling.

### 9.6 PublicProposalView

Sanitized diffs + availableActions from server. Override only server-listed findings.

### 9.7 Guided vs Advanced

**[D3]** Dua mode user-facing, pemetaan 1:1: **Pemula** = Guided, **Mahir** = Advanced. Tidak ada mode ketiga.  
Guided (Pemula): wizards; perubahan fondasi/outline lewat langkah terpandu. Advanced (Mahir) rilis 1: edit foundation/outline/reveal langsung (author_private), proposal ops labels, writer-safe materials panel, inspector. No raw prompt/model IDs/service_restricted.

### 9.8 Terms

Fondasi Cerita, Jadwal Rahasia, Bahan aman, Cek Cerita, Adegan, Usulan AI.

---

## 10. Testing, delivery, DoD (S10 LOCKED)

### 10.1 CI

PR: hosted runner, mocks only, no prod secrets.  
Lint, typecheck, unit, integration (empty + N-1 migrate), contract DTO, Playwright e2e, architecture boundaries, secret/bundle scan.

### 10.2 Release

Immutable artifact + checksum → VPS releases dir → drain workers → migrate → symlink current → ready + smoke (web→DB→worker→mock job→outbox).

### 10.3 Migrations

Expand → backfill → contract. Metadata on each migration. Drift detection. Single migration runner lock.

### 10.4 Backup

DB + artifacts + manifest; RPO 24h / RTO 4h; restore drill required before claiming recovery.  
**[D15]** Backup wajib off-VPS: nightly `pg_dump` + artefak → object storage eksternal (mis. Backblaze B2/Cloudflare R2), terenkripsi (age/GPG), retensi 30 hari. Restore drill dilakukan dari salinan offsite.

### 10.5 DoD vertical slice

Magic link → project → intake → concepts → foundation lock → outline → beat write job → proposals → validate/repair → accept → credit consistency → no service_restricted leak → IDOR 404 → job recovery after refresh.  
Vertical slice dijalankan di desktop dan viewport mobile 375px. **[D20]**  
Plus verification-matrix coverage and architecture gates.

### 10.6 Milestones

M0 scaffold/auth → M1 core/schema → M2 UoW/CRUD → M3 jobs/credit → M4 AI mock contracts → M5 accept/write draft → M6 guided UI e2e → M7 staging → M8 production DoD.

---

## 11. Verification matrix (seed)

| Invariant                                     | Source | Test (name target)     | CI           |
| --------------------------------------------- | ------ | ---------------------- | ------------ |
| Writer packet no restricted truth             | S3     | writer-packet-leak     | unit         |
| Forbidden concepts not in writer guidance raw | S3     | writer-guidance-safe   | unit         |
| Dependency hash order-stable                  | S3     | dependency-hash        | unit         |
| Job terminal immutable                        | S8     | job-terminal           | integration  |
| Reservation closing with unknown attempt      | S8     | reservation-exposure   | integration  |
| WorkflowInvocation single winner              | S8     | invocation-winner      | integration  |
| Accept CAS / supersede                        | S4     | accept-proposal        | integration  |
| Canon version +1 per change set               | S2/S4  | accept-proposal        | integration  |
| IDOR → NOT_FOUND                              | S6     | idor                   | e2e          |
| No service_restricted in client               | S6/S9  | proposal-dto / e2e DOM | contract+e2e |
| CreditQuote one-time                          | S9     | credit-quote           | integration  |
| Working draft CAS conflict                    | S9     | working-draft          | integration  |
| Architecture boundaries                       | S1     | dependency-cruiser     | unit         |
| Magic link two-step                           | S6     | auth-magic-link        | e2e          |
| Vertical slice                                | S10    | vertical-slice         | e2e          |

Full matrix lives in `docs/verification-matrix.md` and is updated with every invariant change.

---

## 12. Implementation notes (coding invariants)

Documented at end of each section during lock; non-exhaustive highlights:

1. Type-safe strip of restrictedDetail (`toPublicFinding`).
2. Repair stop = OR of conditions.
3. Event fold total order: sequence, createdAt, id.
4. Candidate persist only in fenced Tx C.
5. safeRelease ≥ 0; exposure exceeded = ops incident.
6. CreditQuote owner-bound, consumed once.
7. One active working draft per (user, beat).
8. Read models never authorize domain actions alone.
9. Release artifact self-contained; one migration lock.
10. Evidence UTF-16 + content hash.

---

## 13. Glossary (UI / internal)

| UI                  | Internal                   |
| ------------------- | -------------------------- |
| Fondasi Cerita      | Foundation / Story Bible   |
| Jadwal Rahasia      | Reveal schedule            |
| Bahan aman untuk AI | Writer-safe context packet |
| Cek Cerita          | Validator                  |
| Adegan              | Beat                       |
| Usulan AI           | Proposal                   |
| Cerita resmi        | Canon                      |
| Sedang diproses     | GenerationJob              |

---

## 14. Approval

| Section                | Status |
| ---------------------- | ------ |
| S1 Architecture        | LOCKED |
| S2 Data / Canon        | LOCKED |
| S3 Domain Core         | LOCKED |
| S4 Application         | LOCKED |
| S5 AI                  | LOCKED |
| S6 Auth / Security     | LOCKED |
| S7 Prompt / Extraction | LOCKED |
| S8 Reliability         | LOCKED |
| S9 UI                  | LOCKED |
| S10 Delivery / DoD     | LOCKED |

Patch keputusan 2026-07-21 (D1–D20, `docs/DECISIONS.md`) diterapkan atas mandat pemilik produk; S1–S10 tetap LOCKED.

**Next:** writing-plans → implementation plan M0–M8.  
**No implementation until implementation plan direview.**
