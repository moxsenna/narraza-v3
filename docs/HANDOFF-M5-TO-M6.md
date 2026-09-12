# HANDOFF DOCUMENT: NARRAZA V3 (M5 → M6)

Tanggal: 2026-09-12  
Base Commit: `e8fe42f53e5677c0eb7ef9cb71f0e0b5a3f4c834` (`master`, PR #22 merged, CI 8/8 green)  
Active Branch / Worktree: `feat/m6-w6.1` di `.worktrees/feat-m6-w6.1`

---

## 1. Apa yang Sedang Dibangun

**Narraza v3** adalah web app asisten penulisan novel panjang berbasis AI (alur interaktif Indonesia) dengan fondasi cerita ketat, penjaga kontinuitas karakter & rahasia, validasi otomatis, serta sistem kredit deterministik.

### Arsitektur Inti:
- **`packages/core`**: Logika domain murni (policy, validator deterministik, transformator DAG change operation, context packet builder). Zero network, zero DB.
- **`packages/application`**: Port interfaces, Unit of Work (UoW), ChangeSets, Use Cases, Progress Reducer, Public Projections. Single write door (`commitCanonicalChangeSet`).
- **`packages/db`**: Prisma schema (49 tabel, expand-only, soft-delete partial unique index, named CHECK constraints), repositori implementasi ports, raw SQL lock-safe query (`FOR UPDATE SKIP LOCKED`).
- **`apps/web`**: Next.js 16 (React 19), Server Actions, Tailwind CSS v4, semantic tokens only. Dilarang panggil LLM langsung dari client (`command-no-ai`). Tenant scoping ketat di setiap query & action.
- **`apps/worker-gen`**: Background processor untuk job AI & outbox delivery, pemulihan lease, fenced claim.

---

## 2. Status Pekerjaan (Yang Sudah Selesai)

| Milestone | Deskripsi | Status | Catatan |
|---|---|---|---|
| **M0** | Repo, scaffold, auth email+password, shell, CI 8/8 | **SELESAI** | Merged `master` |
| **M1** | Domain core, schema 49 tabel, policies, validator, context packets | **SELESAI** | PR #1–#5 merged |
| **M2** | Ports, UnitOfWork, single write door, tenant scoping, IDOR guard | **SELESAI** | PR #6 merged |
| **M3** | Job state machine, 3-phase execution, credit engine, outbox, credit UI | **SELESAI** | PR #18–#20 merged |
| **M4** | AI layer, mock & real adapters, projectors, parser, model policy D14 | **SELESAI** | PR #21 merged (`0d2fba1`) |
| **M5** | Working draft CAS, validation binding, atomic accept (S4.4), Tutup Bab UI | **SELESAI** | PR #22 merged (`e8fe42f`) |

### Yang Selesai di M5 (PR #22):
- **W5.1**: `ProseWorkingDraft` (CAS concurrency control revision) + `ProseVersion` (immutable content hash).
- **W5.2**: `ValidationReport` binding (hash integrity), override allowlist (default deny), safe repair flow.
- **W5.3**: Atomic proposal accept (S4.4) via UoW (lock owner-first, status check, CAS verify, canon +1 sekali, supersede siblings).
- **W5.4**: Sanitized `PublicProposalView` projection + Tutup Bab UI di route `/selesaikan`.
- **W5.5**: Progress reducer full-journey + deterministic intake sufficiency indicator.

---

## 3. Yang Perlu Dikerjakan Selanjutnya (Milestone M6)

Target utama M6: **Full UI, Design System, Accessibility, dan End-to-End Test**.

### W6.1: Design System & Core Components (Sedang Berjalan)
- **Worktree**: `.worktrees/feat-m6-w6.1` (branch `feat/m6-w6.1` dari master `e8fe42f`).
- **Tailwind v4 theme**: Sinkronisasi token semantic dari `docs/design.md` §25. Dilarang keras memakai hex atau class Tailwind mentah seperti `pink-500`, `gray-700`, dsb. Wajib pakai semantic: `bg-canvas`, `bg-surface`, `bg-brand-soft`, `text-primary`, `border-default`, `status-success`, dll.
- **Tipografi**: Plus Jakarta Sans variable (woff2) + Lora sesuai skala §10.3.
- **Komponen Inti (shadcn adapted)**:
  - Primitives: `Button` (4 varian), `Input`, `Textarea` (autosize via `field-sizing-content`), `Card`, `Chip`, `Badge`, `Skeleton`, `Banner`, `Toast`, `ProgressChecklist`, `Stepper`, `EmptyState`, `Divider`, `Surface`, `Field`.
  - Composites / Dialogs: `ConfirmationDialog` (focus trap native dialog + ESC handler), `BottomSheet`, `Tabs`, `ProposalCard`, `FindingCard`, `ChatBubble` + `QuickReplies`, `CreditQuoteCard`, `JobPhasePanel`.
  - Halaman showcase dev: `/app/_preview/components` (dev/preview only).

### W6.2: Page-by-Page Screen Parity (design.md §2.3–§2.17)
- Landing page final + FAQ privasi.
- Dashboard (5 state) & Mulai Proyek (5 jalur dengan badge non-aktif untuk jalur rilis depan).
- Chat Narra (5 state + fair-use indicator).
- Fondasi Cerita (draft/locked + readiness checklist berbobot deterministik D5 + konfirmasi kunci).
- Karakter & Fakta.
- Outline (hirarki 10 bab + beat detail + downstream lock).
- Ruang Tulis (`/tulis`), Naskah (`/naskah`), Cek Cerita (`/cek`), Tutup Bab (`/selesaikan`), Publish (`/publish`).
- Kredit & Pengaturan.
- Mobile Layout: 5 tab bottom nav, sticky primary CTA, tap target ≥44px di seluruh flow.

### W6.3: Accessibility & Motion
- WCAG AA contrast, focus ring 3px (`--focus-ring-color`), keyboard navigation path.
- Respect `prefers-reduced-motion` (sudah di-setup di `globals.css`).
- Audit checklist `docs/design.md` §26.

### W6.4: Full E2E Integration
- Playwright vertical slice desktop & mobile (375px viewport): dari registrasi → intake chat → konsep → kunci fondasi → outline → tulis mock → periksa → terima proposal → tutup bab → naskah → publish.
- Verifikasi proteksi IDOR, job recovery, credit consistency, dan absence of internal leak strings di DOM.

---

## 4. Dokumen Sandaran Wajib (Single Source of Truth)

Agen baru **WAJIB** membaca dan merujuk dokumen-dokumen berikut sebelum memodifikasi kode:

1. **`docs/PROGRESS-CHECKLIST.md`**:
   - Tracking checklist progress M0–M8.
   - Setiap langkah memiliki acuan acceptance criteria.
2. **`docs/design.md`**:
   - **§10.3**: Skala tipografi (Display XL s/d Caption, line height, font weights).
   - **§11**: Grid 4px/8px, max-width container, radius, shadow.
   - **§14**: Motion duration & behavior (140ms/200ms/250ms, reduced motion).
   - **§15**: Spesifikasi detail setiap komponen produk (Button, Card, Chip, Progress, Chat, Proposal, Editor).
   - **§16**: Pola layar utama.
   - **§25**: Token CSS `:root` dan mapping semantic Tailwind (DILARANG hex/pink mentah).
   - **§26**: Acceptance checklist untuk UI baru.
3. **`docs/implementation-plan.md`**:
   - Master technical architecture document (flow data, error codes, invariants).
4. **`docs/DECISIONS.md`**:
   - Keputusan arsitektur D1–D16 (D4: Credit quote card, D5: Readiness checklist deterministik, D6: Konversi micro-IDR kredit, D9: UoW single write door, D14: Model policy).
5. **`docs/verification-matrix.md`**:
   - Daftar seluruh invarian keamanan & integritas data (S1–S10) beserta nama test pengujinya.
6. **`docs/narraza-v3-prd-rilis-1.md`**:
   - PRD scope Rilis 1 (fitur in-scope vs out-of-scope).
7. **`docs/model-policy.md`**:
   - Kebijakan zero data retention dan proteksi privasi AI.

---

## 5. Invarian & Aturan Teknis yang Tidak Boleh Dilanggar

1. **Single Write Door**: Tidak boleh ada query `INSERT/UPDATE` langsung ke tabel domain dari web app. Seluruh mutasi domain harus lewat `commitCanonicalChangeSet` di `packages/application`.
2. **Tenant Isolation**: Setiap query Prisma harus di-scope dengan `projectId` dan divalidasi dengan `authorizeActiveUser`.
3. **No Raw Colors in UI**: Dilarang menggunakan styling Tailwind sembarangan seperti `text-gray-600` atau `bg-pink-500`. Gunakan token semantik yang didefinisikan di `globals.css` (`bg-surface`, `bg-brand-soft`, `text-primary`, `border-default`, `status-warning`, dll).
4. **No LLM in Web**: Client web dilarang memanggil endpoint AI langsung. Semua tugas generatif adalah background job via worker.
5. **Testing di Windows**: Vitest worker serial terkadang crash di Windows; gunakan mode default/parallel saat menjalankan test suite vitest lokal.
6. **Worktree Isolation**: Semua pengerjaan M6 dilakukan di `.worktrees/feat-m6-w6.1`. Jangan mengubah file master secara langsung tanpa PR.
