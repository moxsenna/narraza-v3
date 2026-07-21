# Narraza v3 — Implementation Plan M0–M8 (Prototype → Production)

**Tanggal:** 21 Juli 2026
**Status:** Siap dieksekusi setelah review pemilik produk
**Sumber kebenaran (urut prioritas):** `DECISIONS.md` (D1–D20) > `narraza-v3-prd-rilis-1.md` > `verification-matrix.md` > `narraza-v3-design-spec.md` (S1–S10) > `design.md` > prototipe (`narraza-landing.dc.html`, `narraza-app.dc.html`, `narraza-mobile.dc.html`).

**Definisi selesai dokumen ini:** setiap halaman dan setiap demo-state di prototipe berjalan dengan mekanisme backend sungguhan (bukan mock di production), seluruh baris verification matrix hijau di CI, dan sistem live di VPS production dengan backup, alert, dan runbook.

---

## 0. Cara membaca dokumen ini

- **§1** — aturan main eksekusi (berlaku di semua milestone).
- **§2** — peta fungsional: SETIAP halaman & state prototipe → mekanisme backend → milestone yang mengerjakannya. Ini kontrak cakupan; tidak boleh ada baris yang tersisa saat M8 selesai.
- **§3** — fondasi teknis lintas-milestone (workspace, konvensi, testing, CI/CD).
- **§4–§12** — milestone M0–M8: tujuan, workstream + task rinci, test yang harus hijau, exit gate.
- **§13–§15** — lampiran: daftar tabel schema, risiko, estimasi & urutan.

Setiap milestone memiliki **exit gate** — checklist yang harus 100% terpenuhi sebelum milestone berikutnya dimulai. Gate tidak boleh di-soft-fail (aturan BRANCH_PROTECTION).

---

## 1. Aturan main eksekusi

1. **Invariant dulu, fitur kemudian.** Setiap task yang menyentuh baris verification matrix ditulis test-first: test target dari matrix dibuat (merah) → implementasi → hijau.
2. **Satu PR = satu workstream (atau lebih kecil).** Semua PR lewat CI 8 required checks (BRANCH_PROTECTION.md).
3. **Mock AI di dev/CI; provider nyata hanya di staging (M7) ke atas.** `AI_ENABLE_MOCK=true` dilarang di production `NODE_ENV`.
4. **Tidak ada teks internal di UI.** Semua copy user-facing dari copy library i18n (message codes); string internal (nama stage, kode error mentah, ID model) dilarang tampil — ditegakkan `no-internal-strings` + `proposal-dto`.
5. **Copy final** diambil dari prototipe (bukan lorem ipsum) → dipindahkan ke message codes di M6.
6. **Demo-state switcher & halaman "Panduan uji" di prototipe adalah alat desain — TIDAK dibangun di produk.** State-nya sendiri (kosong/memuat/gagal/dst.) wajib dibangun sebagai state nyata.
7. **Versi dependency di-pin di M0** dan dicatat di design spec §1.3; tanpa upgrade major di tengah jalan (D7).
8. **Semua angka operasional via env** dengan default D12; tidak ada angka ajaib di kode.

---

## 2. Peta fungsional prototipe → sistem

> Kolom **M** = milestone tempat fungsi selesai end-to-end (backend nyata + UI). Banyak mekanisme backendnya dicicil lebih awal; kolom M menunjuk kapan state itu BERFUNGSI seperti prototipe.

### 2.1 Landing & autentikasi (`narraza-landing.dc.html`)

| Fungsi / state                                                                                                                                                | Mekanisme                                                                                     | M                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| Landing: hero (CTA "Mulai dari ide" + "Lihat cara kerja"), masalah, cara kerja, fitur, untuk siapa, contoh alur, kredit, trust + FAQ privasi (D17), CTA akhir | Halaman statis RSC, konten dari copy library; FAQ privasi sesuai design.md §22.5              | M0 (kerangka) → M6 (final)          |
| Auth `form` — input email, kirim tautan                                                                                                                       | Server Action `requestLoginLink`: rate limit (D10), cap 3 challenge, kirim via Resend/Mailpit | M0                                  |
| Auth `sent` — "cek email", kirim ulang + cooldown                                                                                                             | Cooldown 60 dtk/identifier ditampilkan; batas 5/jam                                           | M0                                  |
| Auth `confirm` — halaman konfirmasi (two-step)                                                                                                                | GET simpan pending HttpOnly cookie + clean URL; tombol POST                                   | M0                                  |
| Auth `verifying` → `success`                                                                                                                                  | POST consume atomik → session Auth.js → redirect dashboard                                    | M0                                  |
| Auth `error` — kedaluwarsa/invalid                                                                                                                            | Pesan ramah + CTA minta tautan baru                                                           | M0                                  |
| Halaman Privasi & Ketentuan                                                                                                                                   | Statis (D17)                                                                                  | M0 (placeholder) → M7 (final legal) |
| 404 / error berbranding                                                                                                                                       | `not-found.tsx` + `error.tsx` dengan jalan kembali (pelajaran lama Y2)                        | M0                                  |

### 2.2 Shell global (`narraza-app.dc.html` header + sidebar)

| Fungsi                                                                                                                  | Mekanisme                                                                                                   | M                         |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------- |
| Header: logo → dashboard; chip kredit (normal / "hampir habis"); chip tier (Hemat/Seimbang/Terbaik); avatar/menu keluar | `CreditSummaryView` (satu fungsi konversi D6); tier dari user settings                                      | M3 (kredit) / M6 (polish) |
| Sidebar 6 grup (PERSIAPAN/PERENCANAAN/PENULISAN/PEMERIKSAAN/PUBLIKASI/LAINNYA) + badge status per item                  | Item aktif/terkunci dari `ProjectProgressView`                                                              | M5 → M6                   |
| Mode switcher Pemula/Mahir (per-user, D3)                                                                               | Kolom `users.uiMode`; gating konten Mahir di server (author_private boleh, service_restricted tidak pernah) | M6                        |
| Drawer nav (< 1024px) + bottom nav mobile (Beranda/Rencana/Tulis/Cek/Lainnya)                                           | Layout responsif                                                                                            | M6                        |

### 2.3 Dashboard (`dashStates`)

| State                                                                    | Mekanisme                                                                                          | M       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------- |
| `terisi` — hero "LANGKAH BERIKUTNYA", kartu proyek + progress, aktivitas | `ProjectProgressView.nextAction` (reducer tunggal); proyek intake WAJIB tampil (pelajaran lama Y1) | M5 → M6 |
| `kosong` — empty state + CTA buat proyek                                 | Query proyek kosong                                                                                | M2      |
| `memuat` — skeleton                                                      | Suspense/skeleton komponen                                                                         | M6      |
| `gagal` — error + coba lagi                                              | Error boundary + retry                                                                             | M6      |
| `cari` (tanpa hasil)                                                     | Filter client-side daftar proyek                                                                   | M6      |

### 2.4 Buat Proyek & Import

| Fungsi                                                                                                                                     | Mekanisme                                                                                | M                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| 5 jalur (belum punya ide / ide kasar / punya draft / punya outline / perbaiki cerita); "punya draft" berbadge "Segera hadir" NONAKTIF (D2) | `createProject(jalur)` → project + intake session; jalur menentukan pembukaan chat Narra | M2 (create) → M6 (UI penuh) |
| Halaman Import Draft                                                                                                                       | TIDAK dibangun di Rilis 1 — hanya badge di kartu jalur                                   | —                           |

### 2.5 Chat Narra / intake (`chatStates`)

| State                                                            | Mekanisme                                                                                                                                 | M                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `awal` — sapaan pembuka + quick replies (maks 3–5)               | Pesan pembuka dari template per jalur (tanpa AI); quick replies dari kontrak intake                                                       | M6                       |
| `mid` — percakapan berjalan, "sinyal cerita terkumpul" bertambah | Pesan user di-persist → job intake-reply (GRATIS fair-use 60/hari, D4; tanpa kartu quote) → balasan Narra + ekstraksi sinyal (structured) | M4 (mekanisme) → M6 (UI) |
| `typing` — indikator Narra mengetik                              | Status job intake berjalan (polling)                                                                                                      | M6                       |
| `gagal` — gagal kirim + retry                                    | Job gagal → pesan ramah "kredit tidak dipotong"; retry = job baru                                                                         | M6                       |
| `siap` — sinyal cukup → CTA "Susun 3 Konsep"                     | Indikator kecukupan dari reducer sinyal intake (deterministik dari field terkumpul; pelajaran lama C8)                                    | M5 → M6                  |

### 2.6 Pilih Konsep (`konsepStates`)

| State                                                 | Mekanisme                                                                                             | M          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| `memuat` — "Menyusun 3 konsep…" fase job tanpa persen | Aksi BERBAYAR: kartu CreditQuote → konfirmasi → job concept-gen → 3 kandidat                          | M4 → M6    |
| `siap` — 3 kartu konsep, pilih satu                   | `acceptConcept` → foundation **draft** (bukan lock) + banner "Fondasi masih draft" (`concept-accept`) | M4/M5 → M6 |
| `gagal` — gagal + kredit tidak dipotong + coba lagi   | `failed-job-zero-charge`; retry = job & quote baru                                                    | M3/M4 → M6 |

### 2.7 Fondasi Cerita (`fondasiStates`)

| State                                                                                                                                                          | Mekanisme                                                                                       | M       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| `draft` — ringkasan konsep, tokoh, konflik, janji pembaca, fakta, panggilan & gaya bicara, target panjang, arah ending; Kesiapan % + checklist + 1 rekomendasi | Foundation draft editable (user origin, single write door); readiness-policy deterministik (D5) | M2 → M6 |
| Lock — dialog konsekuensi + ceklis "Aku mengerti"                                                                                                              | `lockFoundation` guard readiness; e2e `foundation-lock`                                         | M2 → M6 |
| `locked` — tampilan terkunci + apa yang masih bisa diubah                                                                                                      | Status locked; edit selanjutnya via proposal                                                    | M2 → M6 |

### 2.8 Karakter & Fakta

| Fungsi                                                                                 | Mekanisme                                                                                                                       | M          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Daftar karakter + detail (relasi, panggilan/gaya bicara, pengetahuan tokoh)            | Character CRUD user-origin + AI generate (BERBAYAR) → proposal                                                                  | M2/M4 → M6 |
| Fakta: daftar fakta terkunci, status (confirmed/deprecated/contradicted), usulan fakta | Fact hanya lahir dari applied change set (`fact-lifecycle`); kartu "Usulan Narra" Terima/Ubah/Tolak; high-risk konfirmasi kedua | M2/M5 → M6 |

### 2.9 Rencana Bab / Outline

| Fungsi                                                                                                                                                                          | Mekanisme                                             | M          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| Hierarki Roadmap → Mini Arc → Bab (10) → detail Adegan (fungsi bab, arah emosi, janji bab, opening hook, open loop, kemenangan kecil, breadcrumb, rahasia ditahan, ending hook) | Outline gen (BERBAYAR) + CRUD strict user-origin      | M2/M4 → M6 |
| Bab dengan accepted prose terkunci dari edit biasa + alasan                                                                                                                     | `outline-downstream`; edit diarahkan ke flow proposal | M2 → M6    |
| Setujui vs Kunci dipisah + dialog konsekuensi (pelajaran lama X1)                                                                                                               | Konfirmasi eksplisit, state terpisah                  | M6         |

### 2.10 Jadwal Rahasia (`rahasia`)

| Fungsi                                                                                                | Mekanisme                                                                                       | M          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Timeline per-bab: breadcrumb → zona terlarang → target reveal; warning plum bila adegan terlalu dekat | Reveal + breadcrumbs (author_private); reveal-policy                                            | M1/M2 → M6 |
| Inspector Mahir menampilkan truth; Pemula melihat "detail dijaga otomatis"                            | Gating mode di server; truth = author_private (boleh ke pemilik), tidak pernah ke writer packet | M6         |

### 2.11 Ruang Tulis (`writeStates` — 11 state) + editor (`draft/diedit/diterima/konflik`)

| State                                                                                                          | Mekanisme                                                                                                        | M          |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `kosong` — empty state terpandu: bab aktif, arahan adegan, biaya, apa yang terjadi (pelajaran lama C3)         | Beat contract dari outline; CTA generate                                                                         | M6         |
| `quote` — kartu CreditQuote (perkiraan maksimum + kedaluwarsa 10 mnt)                                          | Quote phase: frozen bundle + AIWorkflowPlan → CreditQuote (`request-beat-snapshot`, `credit-quote-plan-binding`) | M3/M4 → M6 |
| `proses` — fase publik (Menyiapkan bahan → Menulis → Memeriksa → Menyusun usulan), tanpa persen; bisa Batalkan | Job async + PublicJobPhase; cancel queued/running (`cancel-queued`, `tombstone-mid-attempt`)                     | M3 → M6    |
| `pulih` — banner "Melanjutkan proses yang berjalan" setelah refresh                                            | Recovery query job aktif (`job-recovery`); JOB_ALREADY_ACTIVE → activeJobId                                      | M3 → M6    |
| `gagal` — error ramah + "kredit tidak dipotong" + coba lagi (job baru)                                         | `failed-job-zero-charge`, `retry-new-job`                                                                        | M3 → M6    |
| `kandidat` — 1–3 tab kandidat, pilih                                                                           | GeneratedCandidate → pilih jadi working draft                                                                    | M5 → M6    |
| `banding` — bandingkan kandidat berdampingan                                                                   | Read model kandidat                                                                                              | M6         |
| `draft` — working draft + autosave "Tersimpan otomatis · Xs lalu"                                              | ProseWorkingDraft autosave CAS (`working-draft`)                                                                 | M5 → M6    |
| `diedit` — label "Diedit kamu", hasil cek jadi basi                                                            | Edit → content hash berubah → `validation-hash`; proposal source=user (`user-proposal`)                          | M5 → M6    |
| `diterima` — versi diterima jelas + label                                                                      | Accepted pointer beat (`prose-fk`)                                                                               | M5 → M6    |
| `konflik` — banner konflik simpanan, pilih versi                                                               | CAS conflict UI                                                                                                  | M5 → M6    |
| Panel bahan aman (Mahir)                                                                                       | Writer-safe packet view (tanpa truth)                                                                            | M6         |

### 2.12 Naskah Bab (`naskah`)

| Fungsi                                                               | Mekanisme                                | M       |
| -------------------------------------------------------------------- | ---------------------------------------- | ------- |
| Baca naskah bab (versi diterima), Lora, lebar 680–760px, label versi | Read model ProseVersion accepted per bab | M5 → M6 |

### 2.13 Cek Cerita (`cekStates`)

| State                                                                                                                                                               | Mekanisme                                                                   | M          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| `berjalan` — sedang memeriksa                                                                                                                                       | Validation job phase                                                        | M5 → M6    |
| `hasil` — temuan: badge Lolos/Perlu ditinjau/Menghambat; blocking TANPA tombol abaikan; "Abaikan dengan alasan" hanya temuan allowlist; "Lihat alasan" untuk detail | merge-findings + override-allowlist + publicMessageCode i18n                | M1/M5 → M6 |
| `bersih` — "Cerita nyambung, rahasia aman, adegan sesuai arahan"                                                                                                    | passed = tanpa temuan blocking                                              | M5 → M6    |
| `basi` — "Hasil cek sudah tidak sesuai — jalankan ulang"                                                                                                            | `validation-hash` stale setelah edit                                        | M5 → M6    |
| `repair` — Safe Repair: aturan yang dijaga, before/after, berhenti otomatis (no-progress/limit), hasil = versi + proposal baru                                      | repair-policy + full re-extraction (`repair-reextract`); BERBAYAR dgn quote | M4/M5 → M6 |

### 2.14 Tutup Bab (`tutupStates`)

| State                                                                                                                                                  | Mekanisme                                                                                                                                              | M       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `tinjau` — semua perubahan fakta/pengetahuan/disclosure direview (diff tersanitasi) → satu aksi "Terapkan & jadikan resmi"; high-risk konfirmasi kedua | Atomic accept: eligibility, CAS, supersede siblings, canon +1 sekali (`accept-proposal`, `accept-cas-stale`, `accept-supersede`, `prose-accept-order`) | M5 → M6 |
| `selesai` — bab resmi + langkah berikutnya                                                                                                             | Progress reducer update                                                                                                                                | M5 → M6 |

### 2.15 Paket Publish (`pubStates`)

| State                                                                                                                                | Mekanisme                                                                                                   | M          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `siap` — 2 kolom: judul/teaser/caption/comment-bait/tags + preview HP + checklist + copy/export; label "tidak mengubah cerita resmi" | Publish gen (BERBAYAR) → ArtifactProposal, tanpa canon bump (`publish-artifact`); hanya dari accepted prose | M4/M5 → M6 |
| `kosong` — belum ada bab diterima                                                                                                    | Guard prasyarat dengan pesan jelas                                                                          | M6         |

### 2.16 Kredit & Penggunaan (`kreditStates`)

| State                                                                               | Mekanisme                                                                                   | M       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- |
| `normal` — tersedia / ditahan / sedang direkonsiliasi + riwayat penggunaan per aksi | Ledger + reservations + konversi D6; header ≡ halaman (`credit-summary`, `credit-rounding`) | M3 → M6 |
| `rendah` — "hampir habis" di header + panduan                                       | Threshold + copy                                                                            | M3 → M6 |

### 2.17 Pengaturan

| Fungsi                                                                                                                          | Mekanisme                                      | M   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --- |
| Profil, mode Pemula/Mahir, tier AI (Hemat/Seimbang/Terbaik — tanpa model ID), keluar semua sesi, hapus akun (tombstone → purge) | User settings; tier → routing plan; S2.7 purge | M6  |

### 2.18 Mobile 375px (`narraza-mobile.dc.html`)

Semua layar kunci (dashboard, rencana, tulis, cek, publish) satu kolom, aksi primer sticky, panel jadi bottom sheet, tap target ≥44px — dibangun sebagai responsive varian halaman yang sama (bukan app terpisah), M6; diverifikasi `vertical-slice-mobile` (D20).

---

## 3. Fondasi teknis lintas-milestone

### 3.1 Workspace & tooling (ditetapkan di M0)

- **Node 22 LTS**, **pnpm** workspaces. Monorepo:
  ```
  apps/web            Next.js App Router (adapter only)
  apps/worker-gen     host proses worker (generation + outbox module — D11)
  apps/worker-outbox  entrypoint mandiri (dipakai saat pisah proses)
  packages/core       domain murni (tanpa AI/DB/HTTP/Next)
  packages/application  use cases + UnitOfWork + ports
  packages/ai         provider adapters, routing, prompts, parse, model-policy
  packages/db         Prisma schema+client, repos implement ports, Auth.js adapter (D8)
  packages/shared     DTO, zod schemas, env schemas per proses, i18n message codes, utils
  prisma/             migrations (via packages/db)
  deploy/             nginx, PM2 ecosystem, skrip release/migrate/backup/restore
  ```
- Versi di-pin M0 (D7): Next.js stabil terbaru + React; Prisma ≥6; Tailwind v4; Auth.js v5; zod; vitest + testcontainers; Playwright; dependency-cruiser; pino. Catat persis di design spec §1.3.
- `docker-compose.dev.yml`: postgres:16 + mailpit.
- TS strict semua package (project references); eslint + prettier satu config root.

### 3.2 Konvensi kode

- **Error model:** `AppError { code, publicMessageCode, httpStatus, details? }`; IDOR/keberadaan resource orang lain SELALU `NOT_FOUND`. Server Action mengembalikan DTO hasil `Result<T, PublicError>` — tidak pernah melempar error mentah ke client.
- **DTO boundary:** semua data ke client lewat mapper eksplisit di `packages/shared/dto`; field `service_restricted` tidak pernah ada di tipe DTO (ditegakkan type-level + `proposal-dto` contract test).
- **i18n:** copy user-facing = message codes (`msg.auth.sent.title` dst.) dengan katalog id-ID; validator memakai `publicMessageCode`.
- **Waktu:** semua timestamp operasional dari `NOW()` PG (helper `dbNow(tx)`).
- **ID:** cuid/uuidv7 dari server; client tidak pernah membuat ID entitas.

### 3.3 Testing harness

- **Unit** (vitest): packages/core, shared, ai-parse — tanpa DB.
- **Integration** (vitest + testcontainers postgres): application + db; tiap file test = schema terisolasi (template DB) supaya paralel.
- **Contract**: zod parse fixtures untuk semua DTO + AI output contracts.
- **Architecture**: dependency-cruiser rules = `web-boundary`, `core-boundary`, `application-boundary`, `ai-boundary`, `worker-boundary`, `command-no-ai`, `env-boundary`(+unit).
- **E2E** (Playwright): project desktop 1280 + mobile 375 (D20); Mailpit API untuk magic link; mock AI deterministik.
- **Migration**: job CI `migrate-empty`, `migrate-upgrade` (fixture N-1), `prisma-migrate-diff` drift.
- **Deploy-test** (pipeline release, bukan PR): `migration-runner-lock`, `readiness-migration-version`, `deploy-checksum`.

### 3.4 CI/CD

- `ci.yml` — 8 job dengan nama PERSIS seperti BRANCH_PROTECTION.md: Lint & Typecheck · Unit Tests · Integration Tests · Architecture Boundaries · Migration (empty + drift) · Security Smoke · Contract Tests · E2E (Playwright).
- Security Smoke: env-boundary, scan bundle client (tidak ada AI keys/istilah internal), `no-internal-strings` subset.
- `release.yml` (tag): build artifact immutable + checksum + manifest → deploy-test → (manual approve) → deploy staging/production.

---

## 4. M0 — Repo, scaffold, auth, shell kosong

**Tujuan:** fondasi kerja: monorepo jalan, CI hijau pertama, login magic link end-to-end nyata, shell app kosong yang sudah benar strukturnya.

### Workstream

**W0.1 Repo & tooling**

1. `git init`, `.gitignore` (node, next, env, playwright), `.editorconfig`, README ringkas (cara run dev).
2. pnpm workspace + skeleton 5 packages + 3 apps (§3.1); TS project references; eslint/prettier; skrip `dev`, `build`, `test`, `lint` root.
3. Pin & catat versi (D7) → update design spec §1.3.
4. Push ke GitHub, aktifkan branch protection sesuai dokumen setelah CI run pertama.

**W0.2 Env & config**

1. `packages/shared/env`: zod schema per proses — `webEnv` (AUTH_SECRET, DATABASE_URL_WEB, RESEND_API_KEY, EMAIL_FROM, RATE_LIMIT_PEPPER, EMAIL_CHALLENGE_PEPPER, APP_URL, MICRO_IDR_PER_CREDIT, param D12 yang relevan), `workerEnv` (DATABASE_URL_WORKER, OPENROUTER_API_KEY, GEMINI_API_KEY, AI_ENABLE_MOCK, param job D12), `outboxEnv`.
2. Test `env-boundary`: schema web TIDAK memiliki field kunci AI; worker tidak punya AUTH_SECRET.
3. `docker-compose.dev.yml` postgres+mailpit; `.env.example` per proses.

**W0.3 Prisma baseline + migration runner**

1. Schema M0: `User` (status aktif, uiMode, tier), `Session`, `EmailLoginChallenge` (tokenHash, expiresAt, consumedAt, revokedAt), `AuditEvent`.
2. Skrip `migrate` dengan PG advisory lock (dasar `migration-runner-lock`).
3. CI job Migration: migrate empty DB + drift check.

**W0.4 Auth magic link two-step (S6, D10)**

1. `requestLoginLink(email)`: normalisasi identifier; rate limit (60s cooldown, 5/jam/identifier, 20/jam/IP — tabel `RateLimitCounter` dengan pepper hash); cap 3 challenge aktif (revoke terlama); simpan tokenHash (pepper); kirim email (Resend prod / SMTP Mailpit dev).
2. `GET /masuk/konfirmasi?token=` → set pending HttpOnly cookie + redirect clean URL; `POST consume` → atomik: validasi hash+expiry, tandai consumed, revoke siblings, buat session Auth.js DB, redirect `/app`.
3. Session policy: absolute 30d, idle 14d, `lastActiveAt` write ≤1×/6 jam (middleware).
4. `authorizeActiveUser` helper (guard semua Server Action ke depan).
5. UI: `/masuk` (state form/sent + cooldown), `/masuk/konfirmasi` (confirm/verifying/success/error) — sesuai §2.1.

- Tes: `auth-magic-link` (e2e via Mailpit), `challenge-cap`, `magic-link-rate-limit`, `session-idle-policy`, `active-user-guard`.

**W0.5 Shell & halaman statis**

1. Landing kerangka (hero + cara kerja + CTA; copy dari prototipe; final polish M6).
2. App shell: header (logo, placeholder chip kredit, avatar+keluar), sidebar grup + item disabled, guard auth redirect.
3. Dashboard kosong (state `kosong` nyata), `/privasi` `/ketentuan` placeholder, 404/error berbranding.

**W0.6 CI**

1. `ci.yml` 8 jobs (§3.4) — semua hijau (E2E = smoke auth saja dulu).
2. dependency-cruiser rules dasar aktif.

### Exit gate M0

- [ ] Login → dashboard berfungsi di dev dengan Mailpit; e2e auth hijau.
- [ ] 8 CI job hijau di `master`; branch protection aktif.
- [ ] `env-boundary`, `migrate-empty`, arch boundaries hijau.
- [ ] Versi stack tercatat di design spec §1.3.

---

## 5. M1 — Domain core & schema kritis

**Tujuan:** seluruh kebijakan domain murni (packages/core) teruji unit tanpa DB, dan schema Prisma lengkap termigrasi.

### Workstream

**W1.1 Schema penuh + raw SQL**

1. Tambah semua tabel Lampiran B (§13) dalam migrasi bertahap expand-only.
2. Raw SQL: partial unique `WHERE deleted_at IS NULL`; composite FK `(beat_id, accepted_prose_version_id)`; CHECK enums/status; index kunci (job claim, ledger dedupe, belief fold).
3. Fixture N-1 + `migrate-upgrade`; drift check.

- Tes: `soft-delete-unique`, `prose-fk` (level schema, via integration ringan).

**W1.2 Nilai & kebijakan inti**

1. `NarrativePosition {chapterId, beatId?, sequence}` + komparator.
2. `reveal-policy`: dari reveal+breadcrumbs+posisi → dua view: writer guidance (aman) vs restricted guard set; truth TIDAK pernah masuk guidance.
3. `expression-policy`: non-POV → behavioral directives, bukan raw belief.
4. `knowledge-policy`: belief streams fold (total order sequence, createdAt, id); transisi downgrade butuh alasan yang diizinkan.
5. `disclosure-policy`: fold FactDisclosure → ReaderFactState + retraction target.
6. `readiness-policy` (D5): bobot per unsur fondasi + kriteria terpenuhi + rekomendasi berikutnya; output {percent, checklist[], nextRecommendation}.
7. `dependency-manifest`: canonical serialization (sort key stabil) + schema version prefix + SHA-256; tolak duplikat (entityType, entityId).
8. `stale-policy`: dependency berubah → needs_revalidation | stale; bump global saja TIDAK menginvalidasi.
9. `prose-policy`, `repair-policy` (stop OR: resolved/limit/no-progress/repeat/regression).

- Tes: `expression-policy`, `belief-transition`, `disclosure-fold`, `foundation-readiness`, `dependency-hash`, `repair-policy`.

**W1.3 Context packets**

1. Discriminated unions 5 packet + builder allowlist (planner/validator=restricted; writer/repair=writer_safe; extraction=per use case).
2. `planner_only` facts terlarang dari writer packet.

- Tes: `writer-packet-leak`, `writer-guidance-safe`.

**W1.4 Validator deterministik**

1. Structural checks kontrak beat; matcher restricted-representation (exact/alias/co-occurrence/proximity → matched|suspected|requires_semantic_review).
2. `merge-findings`: AI hanya menambah; blocker deterministik tak bisa dihapus/diturunkan; `passed = no blocking`.
3. `toPublicFinding`: strip type-level restrictedDetail → publicMessageCode.

- Tes: `merge-findings`, fixture adversarial dasar untuk `prompt-injection-guard` (level kebijakan).

**W1.5 Operation layers**

1. `ModelSuggestionDraft` → `NormalizedOperationDraft` → `CanonicalChangeOperation` (ketiganya beda tipe; model tak bisa deserialize ke tipe canonical — `op-type-boundary`).
2. Resolusi: alokasi ID, tempRef per kandidat, DAG + topo sort, operationsHash; system-derived fields (operationId, targetId, revisions, risk, factKey, sequences, prose.accept).
3. Allowlist ops + max counts per kontrak (beat.write/repair/outline/foundation/intake); prose.accept selalu terakhir.

- Tes: `op-type-boundary`, `tempref-resolve`, `op-allowlist`, `prose-accept-order` (unit), `repair-reextract` (unit).

### Exit gate M1

- [ ] Semua test unit S3/S7 di verification matrix hijau.
- [ ] Migrasi empty + N-1 hijau; drift bersih.
- [ ] Coverage core: setiap kebijakan punya test file khusus.

---

## 6. M2 — Ports, UnitOfWork, alur user-origin (project → fondasi → outline)

**Tujuan:** pengguna nyata bisa: buat proyek, isi chat (tersimpan), edit fondasi draft, lock fondasi, kelola karakter/fakta/outline/rahasia — semuanya lewat single write door, tenant-scoped, tanpa AI.

### Workstream

**W2.1 Ports & UnitOfWork (D9)**

1. Interface ports: ProjectRepo, FoundationRepo, CharacterRepo, FactRepo, OutlineRepo, RevealRepo, ProposalRepo, ChangeSetRepo, LedgerPort, AuditPort, OutboxPort, SnapshotPort, JobPort (stub M3).
2. `unitOfWork.execute(fn, opts?)`: default read committed; opsi serializable per use case; bounded retry (3, jitter, requestId sama); transaction-scoped ports.
3. Prisma repos implement ports; `dbNow` helper.

**W2.2 Single write door**

1. `commitCanonicalChangeSet(tx, changeSet)`: validasi ops → terapkan ke tabel canon → bump entity revisions → `project.currentCanonicalVersion += 1` (sekali) → AuditEvent + OutboxEvent.
2. User-origin proposal path: edit penting (fakta, reveal, outline pasca-lock) → ChangeSet `origin=user` → commit langsung (tanpa review AI) atau via konfirmasi high-risk.

- Tes: `fact-lifecycle`, `accept-proposal` (kasus dasar: +1 per change set).

**W2.3 Use cases + Server Actions (semua `authorizeActiveUser` + tenant scope)**

1. `createProject(jalur)` → project + intake session + pesan pembuka template.
2. `appendIntakeMessage` (persist saja; balasan AI = M4).
3. Foundation: `updateFoundationDraft` (autosave field), `confirmFoundation`, `lockFoundation` (guard readiness + konfirmasi); readiness view dari core.
4. Character CRUD; Fact CRUD via change set; Reveal + breadcrumbs CRUD (author_private).
5. Outline: buat/ubah roadmap-arc-chapter-beat (strict); `outline-downstream` guard: bab ber-accepted-prose menolak upsert biasa → arahkan ke proposal.

- Tes: `outline-downstream`, `concept-accept` (dengan konsep seeded; job AI nyata M4), `idor` (e2e), `active-user-guard`.

**W2.4 Progress reducer v1 + halaman fungsional polos**

1. `ProjectProgressView(projectSnapshot) → {stage, blockers[], nextAction, counts}` — dipakai dashboard & redirect (`progress-view`).
2. Halaman fungsional tanpa polish: dashboard terisi/kosong, beranda proyek, fondasi (draft/locked + readiness), karakter, fakta, outline, rahasia. (Polish + semua state visual M6.)

### Exit gate M2

- [ ] Alur manual: buat proyek → chat tersimpan → fondasi diisi → lock → outline 10 bab tersusun manual — jalan di browser.
- [ ] `fact-lifecycle`, `outline-downstream`, `progress-view`, `idor`, canon +1 hijau.
- [ ] Tidak ada query tanpa tenant scope (review checklist PR).

---

## 7. M3 — Jobs, worker, outbox, credit

**Tujuan:** mesin async & uang: job Postgres dengan lease/fence, worker proses terpisah, outbox, dan seluruh siklus kredit (quote→reserve→settle/release→closing) termasuk kebijakan nol-potongan — teruji dengan mock stage executor (AI nyata M4).

### Workstream

**W3.1 Job state machine**

1. Tabel `GenerationJob` + claim `FOR UPDATE SKIP LOCKED` + leaseToken/fenceVersion; heartbeat perpanjang (D12); reclaim sweeper.
2. Transisi CAS: queued→running→succeeded/failed/dead/cancelled; running→queued (exec retry, fenced); terminal immutable.
3. Cancel: queued = langsung + release; running = `cancelRequestedAt`, worker cek tiap stage; manual retry = job baru `retryOfJobId`.
4. `apps/worker-gen`: loop claim, graceful shutdown (SIGTERM: selesaikan stage, lepas lease), PM2 ecosystem file.

- Tes: `job-terminal`, `exec-retry`, `cancel-queued`, `retry-new-job`, `lease-fence-publish`.

**W3.2 WorkflowInvocation & three-phase attempt**

1. Invocation per stage key; attempts; CAS pemilihan winner; late attempt catat usage tanpa mengganti winner.
2. Harness three-phase: Tx buat attempt → panggilan eksternal (mock) → Tx finalize + settle exposure → validasi CPU → Tx C fenced publish hasil.

- Tes: `invocation-winner`, `late-attempt`, `tombstone-mid-attempt`.

**W3.3 Credit engine (S2.6 + D4 + D6)**

1. Ledger append-only + dedupe keys; reservations + closing; `safeRelease ≥ 0`; exposure exceeded → ops incident (alert M7).
2. Quote: `issueCreditQuote` terikat workflowPlanHash+dependencyHash+maxMicroIdr+expiry(10m); consume sekali; expired → minta baru.
3. Konfirmasi: revalidasi owner/quote/hash/saldo → jobId + reserve → enqueue (idempotent by requestId).
4. **Zero-charge:** finalisasi job tanpa output berguna → release penuh reservation user (settlement biaya provider → akun sistem via AIUsageEvent).
5. Konversi display (D6): satu fungsi `microIdrToCredits` floor/ceil; `CreditSummaryView {available, held, reconciling}`.
6. Retention sweeper: quote/bundle tak terpakai (D12).

- Tes: `credit-quote`, `reservation-exposure`, `failed-job-zero-charge`, `credit-rounding`; (`request-beat-snapshot`, `credit-quote-plan-binding` menyusul lengkap di M4 saat plan nyata ada).

**W3.4 Outbox**

1. OutboxEvent + receipts (processing/completed/uncertain/dead + deliveryGeneration); consumer module di worker (D11); handler idempotent; replay dead = generasi baru dedupeKey sama.

- Tes: `outbox-idempotent`, `outbox-uncertain-delivery`, `outbox-replay-generation`.

**W3.5 UI mekanis (fungsional, polish M6)**

1. Komponen `CreditQuoteCard` generik (perkiraan, kedaluwarsa, konfirmasi) — dipakai SEMUA aksi berbayar (D4).
2. Komponen `JobPhasePanel` (fase publik, batalkan, tanpa persen) + polling client (D12) + recovery banner + JOB_ALREADY_ACTIVE.
3. Halaman Kredit (normal/rendah) + chip header dari `CreditSummaryView` yang sama.

- Tes e2e awal: `job-recovery` (dengan mock job), `credit-summary`.

### Exit gate M3

- [ ] Mock job end-to-end dari UI: quote → konfirmasi → fase berjalan → sukses/gagal → kredit konsisten; refresh di tengah → pulih.
- [ ] Semua test S8 + credit di matrix hijau.
- [ ] Kill -9 worker di tengah job → reclaim benar, tanpa double publish (uji manual + test fence).

---

## 8. M4 — AI layer: workflow plan, mock provider, kontrak nyata

**Tujuan:** semua workflow AI produk (intake reply, 3 konsep, isi fondasi, karakter, outline, tulis adegan+judge, repair, publish) berjalan end-to-end terhadap **mock provider deterministik**; adapter OpenRouter/Gemini siap tapi terkunci di belakang flag.

### Workstream

**W4.1 Port & mock provider**

1. `buildWorkflowPlan`, `executeSingleAttempt` (1 panggilan = 1 attempt), `parseOutput`, `classifyError`, `decideNextAction`.
2. Mock provider: deterministik per fixture; fault injection (timeout, malformed JSON, refusal, partial) untuk test jalur gagal; `AI_ENABLE_MOCK` hanya non-production.

**W4.2 Routing & pricing**

1. RoutingPlan per stage + execution profiles (structured mode, timeout, priceSnapshotId); tier Hemat/Seimbang/Terbaik → profil; worst-case budget = Σ(stage × maxInvocations) → dasar quote.
2. `ModelPriceSnapshot` immutable + seeding; ceil estimasi; requested vs resolved model ID.

- Tes: `request-beat-snapshot`, `credit-quote-plan-binding` (lengkap).

**W4.3 Prompt projectors + parsing (D13)**

1. Projector typed per kontrak (compile-time packet kind): intake-reply, concept×3, foundation-fill, character-build, outline-10, beat-write, judge, repair, extraction, publish-package.
2. Versi eksplisit + content hash; delimiter wrapping konten user; semua output zod `.strict()`; parse-repair path (attempt terpisah).
3. Judge → publicMessageCode (+internalRationale restricted).

- Tes: contract fixtures per projector, `proposal-operation-hash`, `prompt-injection-guard` (adversarial fixtures lewat mock; assert direktif tak berubah & blocker tak terhapus).

**W4.4 Model policy (D14)**

1. `packages/ai/model-policy.ts` + `docs/model-policy.md`; guard routing: packet restricted → hanya model allowlist; selain itu error konfigurasi.

- Tes: `model-policy-allowlist`.

2. **Gate:** daftar final provider/endpoint no-training/no-retention di-review & ditandatangani pemilik produk.

**W4.5 Adapter nyata**

1. OpenRouter adapter + Gemini adapter (klasifikasi error ternormalisasi, timeout, usage extraction); di belakang env; dipakai pertama kali di staging M7.

**W4.6 Merangkai workflow produk**

1. Intake reply: jalur GRATIS fair-use (D4) — auto-quote sistem tanpa kartu; ekstraksi sinyal → update indikator kecukupan.
2. Concept-gen (3 kandidat) → pilih → foundation draft (`concept-accept` penuh).
3. Foundation-fill, character-build, outline-10: hasil = proposal user-review (Terima/Ubah/Tolak), bukan langsung canon.
4. Beat-write: writer → judge dalam satu plan; kandidat 1–3 → GeneratedCandidate.
5. Repair: directives tersanitasi → versi+proposal baru; extraction penuh ulang.
6. Publish-package → ArtifactProposal.

- Tes integrasi per workflow dengan mock (sukses, gagal-parse→repair, gagal-total→zero-charge).

### Exit gate M4

- [ ] Dari UI (dev, mock): chat mendapat balasan Narra; 3 konsep tersusun; fondasi terisi; outline 10 bab dari AI; adegan tertulis dengan 1–3 kandidat; repair jalan; publish package terbentuk.
- [ ] `command-no-ai`, `model-policy-allowlist`, `prompt-injection-guard`, kontrak parse — hijau.
- [ ] Model policy doc final di-approve.

---

## 9. M5 — Proposal accept, working draft, validation binding, progress final

**Tujuan:** loop kepercayaan lengkap: draft → cek → (repair) → terima → canon; semua invariant proposal/canon hijau.

### Workstream

**W5.1 Working draft & versi**

1. `ProseWorkingDraft` per (user, beat) unik; autosave CAS revision; konflik → DTO konflik (UI banner).
2. Snapshot → `ProseVersion` immutable (cek revision + content hash); pilih kandidat = seed working draft.

- Tes: `working-draft`.

**W5.2 Validation & repair binding**

1. `ValidationReport` terikat (proseVersionId, proseContentHash, policyVersion); jalankan validator deterministik + AI judge (merge-findings).
2. Edit draft → hash berubah → report stale (`validation-hash`).
3. Override hanya temuan allowlist server + alasan (`override-allowlist`).
4. Safe Repair orchestration: stop conditions, before/after summary, hasil = ProseVersion + Proposal baru; tidak pernah auto-accept.

**W5.3 Atomic accept penuh (S4.4)**

1. Lock proposal+group+project → ownership → status guard → stale decision (dependency-based) → supersede pre-check → eligibility dari report → CAS ops → bump revisions → canon +1 sekali → accept + supersede siblings → audit/outbox.
2. CAS fail → tx baru conditional `WHERE status='pending'` → stale.
3. User-edited prose → Proposal `source=user` dengan extraction ulang.
4. Publish artifact accept tanpa canon bump.

- Tes: `accept-proposal`, `accept-cas-stale`, `accept-supersede`, `proposal-unrelated-version-bump`, `user-proposal`, `publish-artifact`, `prose-accept-order` (integration), `proposal-dto` (contract).

**W5.4 Tutup Bab & PublicProposalView**

1. Read model diff tersanitasi + `availableActions` server-derived; high-risk flag → UI konfirmasi kedua.
2. Aksi "Terapkan & jadikan resmi" = accept change set bab.

**W5.5 Progress reducer final + intake sufficiency**

1. Reducer mencakup semua stage sampai publish; nextAction per halaman; sidebar badges.
2. Indikator kecukupan intake deterministik (field sinyal terkumpul) → CTA "Susun 3 Konsep".

### Exit gate M5

- [ ] Alur penuh dengan mock: intake → konsep → fondasi lock → outline → tulis → cek → repair → terima → naskah → publish — dari UI, tanpa menyentuh DB manual.
- [ ] Seluruh invariant S2/S4/S7/S9 (proposal/canon/draft/validation) hijau.

---

## 10. M6 — UI penuh, design system, aksesibilitas, vertical slice e2e

**Tujuan:** SETIAP state di §2 tampil dan berperilaku persis semangat prototipe, di desktop dan mobile, memenuhi WCAG 2.2 AA alur utama.

### Workstream

**W6.1 Design system**

1. Tailwind v4 theme dari token design.md §25 (semantic: `bg-canvas`, `text-primary`, `border-default`, `status-*`); dilarang hex/pink mentah di komponen (lint rule).
2. Font: Plus Jakarta Sans variable (self-host woff2, `wght 400..800`) + Lora; skala tipografi §10.3.
3. Komponen inti (adaptasi shadcn): Button (4 varian), Input/Textarea autosize, Card, Chip/Badge, Dialog (focus trap + ceklis konfirmasi), BottomSheet, Toast, Skeleton, Banner, Tabs, ProgressChecklist, Stepper, EmptyState, `CreditQuoteCard`, `JobPhasePanel`, `ProposalCard` (Usulan Narra: label→isi→dampak→risiko→aksi; high-risk dobel konfirmasi), `FindingCard`, ChatBubble (Narra/user) + QuickReplies.
4. Storybook ringan ATAU halaman `/dev/komponen` (dev only) untuk review visual.

**W6.2 Implementasi halaman per halaman** — setiap state di §2.3–§2.17, dengan copy final dari prototipe → message codes:

1. Landing final + FAQ privasi + halaman Privasi/Ketentuan (draft final, direview M7).
2. Dashboard (5 state) · Buat Proyek (5 jalur, draft disabled).
3. Chat Narra (5 state; fair-use indicator halus saat mendekati batas).
4. Konsep (3 state) · Fondasi (draft/locked + readiness + lock dialog) · Karakter · Fakta.
5. Outline (hierarki + beat detail + locked downstream + dialog setujui/kunci terpisah) · Jadwal Rahasia (timeline + inspector Mahir).
6. Ruang Tulis (11 state + editor 4 state + panel bahan aman Mahir) · Naskah.
7. Cek Cerita (5 state) · Tutup Bab (2 state) · Publish (2 state).
8. Kredit (2 state) · Pengaturan (profil, mode, tier, sesi, hapus akun).
9. Mobile: bottom nav 5 tab, sticky primary action, sheet, tap target ≥44px — di semua halaman di atas.

**W6.3 Aksesibilitas & motion**

1. Audit kontras AA, focus ring 3px, keyboard path semua aksi, live region status job/autosave, `prefers-reduced-motion`, durasi motion §14.
2. Checklist §26 design.md dijalankan per halaman (dokumen review disimpan di `docs/review/`).

**W6.4 E2E penuh**

1. `vertical-slice` (desktop) + `vertical-slice-mobile` (375px): magic link → proyek → intake → konsep → fondasi lock → outline → beat write (mock) → kandidat → cek → terima → naskah → publish → kredit konsisten.
2. `foundation-lock`, `job-recovery`, `credit-summary`, `no-internal-strings` (scan DOM seluruh halaman), `idor`.

### Exit gate M6

- [ ] Semua baris §2 berstatus terpenuhi (audit baris-per-baris, dicatat).
- [ ] Vertical slice desktop + mobile hijau di CI.
- [ ] Checklist a11y & brand §26 lulus untuk semua halaman alur utama.

---

## 11. M7 — Staging hardening (VPS, email nyata, AI nyata, kalibrasi, keamanan, backup)

**Tujuan:** replika produksi yang diuji keras; semua yang "nyata" dinyalakan pertama kali di sini.

### Workstream

**W7.1 Infrastruktur staging**

1. VPS Ubuntu LTS: user deploy non-root, UFW (22/80/443), fail2ban, unattended-upgrades; Postgres 16 (lokal VPS) dengan user terpisah web/worker/outbox least-privilege; nginx + TLS (Let's Encrypt) + HTTP/2; PM2 2 proses (D11) + startup script.
2. Struktur rilis: `releases/<checksum>/` + symlink `current`; skrip deploy: upload artifact → verify checksum → drain worker → migrate (lock) → symlink → reload → readiness + smoke (web→DB→worker→mock-job→outbox).

- Tes deploy-test: `migration-runner-lock`, `readiness-migration-version`, `deploy-checksum`, `migrate-upgrade`.

**W7.2 Email produksi**

1. Domain + Resend: SPF, DKIM, DMARC; template email magic link final (copy + brand); uji inbox placement (Gmail/Yahoo).

**W7.3 AI nyata (sandbox)**

1. Kunci OpenRouter + Gemini staging; model policy enforced; jalankan seluruh workflow dengan model nyata pada proyek uji; tuning prompt seperlunya (versi & hash naik).
2. **Kalibrasi harga (D6):** ukur biaya nyata per workflow → set price snapshots → tetapkan `MICRO_IDR_PER_CREDIT` & grant awal → validasi quote vs realisasi (quote ≥ realisasi di ≥95% kasus).

**W7.4 Keamanan**

1. Security headers (CSP nonce, HSTS, frame-ancestors none, referrer-policy), cookie flags, audit `pnpm audit` + lockfile review, secret scanning, uji manual IDOR & rate limit di staging, health/readiness internal-only (nginx allowlist).
2. Review log: pastikan nol service_restricted/security di log (sampling + grep otomatis).

**W7.5 Backup, restore, observability (D15, D16)**

1. Nightly pg_dump + artifacts → object storage off-VPS terenkripsi; retensi 30 hari; verifikasi otomatis ukuran/checksum.
2. **Restore drill terdokumentasi** dari salinan offsite ke VPS kosong → readiness hijau (bukti RPO/RTO).
3. Alert sweeper 5-menit (job dead, closing >6j, outbox dead/uncertain >1j) + rekonsiliasi ledger harian → email ops; uji tiap alert dengan fault injection.
4. Runbook `docs/runbook.md`: deploy, rollback (symlink sebelumnya + migrasi N-1 aman), incident kredit/job/outbox, rotasi secrets, restore.

**W7.6 Uji beban ringan & stabilitas**

1. Skenario k6: 50 user simultan browsing + 10 job paralel; tidak ada error 5xx, p95 halaman < 1.5s, job tidak saling mencuri lease.
2. Soak 24 jam dengan job berkala; nol kebocoran reservation/lease.

### Exit gate M7

- [ ] Seluruh vertical slice dijalankan di STAGING dengan AI nyata + email nyata — hijau.
- [ ] Restore drill offsite sukses & terdokumentasi; semua alert teruji nyala.
- [ ] Kalibrasi kredit ditandatangani pemilik produk (harga per aksi + grant awal).
- [ ] Checklist keamanan W7.4 lengkap.

---

## 12. M8 — Production deploy & launch

**Tujuan:** live, terpantau, dan DoD PRD §11 ditandatangani.

1. Provision VPS production (spek sama staging; secrets terpisah; peppers baru), DNS + TLS, deploy artifact yang SAMA dengan yang lulus staging (checksum identik).
2. Smoke production: readiness, magic link nyata, 1 proyek uji internal end-to-end (lalu dihapus via purge path — sekaligus menguji purge).
3. Seed: paket grant kredit pengguna baru; konfigurasi fair-use; verifikasi model policy production.
4. Halaman legal final (Privasi/Ketentuan) direview & dipublikasikan.
5. Monitoring hari-1: alert aktif, cek rekonsiliasi ledger manual hari pertama, error budget review harian selama minggu pertama.
6. **DoD sign-off** (PRD §11): seluruh verification matrix hijau; artefak rilis immutable + checksum; runbook + env docs + migration metadata + restore drill tersedia; audit §2 dokumen ini: tidak ada baris peta fungsional yang belum terpenuhi.

### Exit gate M8 (= selesai Rilis 1)

- [ ] Semua checklist DoD PRD §11 tercentang dengan bukti (link CI run, dokumen drill, audit §2).

---

## 13. Lampiran B — Daftar tabel schema (baseline M1)

Identity & auth: `users`, `sessions`, `email_login_challenges`, `rate_limit_counters`.
Project & planning: `projects`, `intake_sessions`, `intake_messages`, `concept_sets`, `concepts`, `foundations`, `characters`, `character_states`, `character_beliefs`, `roadmaps`, `arcs`, `chapters`, `beats`.
Knowledge & reveal: `facts`, `fact_disclosures`, `reader_fact_states`, `reveals`, `reveal_breadcrumbs`.
Prose: `prose_versions`, `prose_working_drafts`, `prose_evidence`.
Proposal & canon: `proposal_groups`, `proposals`, `generated_candidates`, `canonical_change_sets`, `canonical_change_operations`.
Snapshot & AI: `context_snapshots`, `generation_context_bundles`, `ai_workflow_plans`, `model_price_snapshots`, `ai_usage_events`.
Jobs: `generation_jobs`, `generation_attempts`, `workflow_invocations`.
Credit: `credit_ledger`, `credit_reservations`, `credit_quotes`.
Validation: `validation_reports`, `validation_findings`.
Publish: `artifact_proposals`, `publish_artifacts`.
Ops: `audit_events`, `outbox_events`, `outbox_receipts`.

(Definisi kolom mengikuti S2; partial unique soft-delete; composite FK accepted prose; enum via Prisma + CHECK raw SQL.)

## 14. Lampiran C — Risiko utama & mitigasi

| Risiko                                                | Dampak              | Mitigasi                                                                                                                                |
| ----------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Kualitas output model nyata ≠ mock (M7 baru ketahuan) | Rework prompt besar | Kontrak output ketat sejak M4; fixture dibuat DARI respons model nyata percobaan kecil di awal M4 (spike 1–2 hari dengan kunci sandbox) |
| Kalibrasi harga meleset (quote < realisasi)           | Rugi per aksi       | Ceil + buffer di estimasi; monitor selisih quote-vs-realisasi di staging; konstanta mudah diubah (D6)                                   |
| Scope UI M6 membengkak (40+ state)                    | Jadwal molor        | §2 = daftar tertutup; state di luar §2 masuk backlog pasca-R1; audit baris-per-baris di gate                                            |
| Serialization/lock contention saat accept             | Error user          | D9 (read committed + lock eksplisit) + retry; test konkurensi di M5                                                                     |
| Deliverability email                                  | User tak bisa login | SPF/DKIM/DMARC di M7 + uji inbox; fallback: tombol "kirim ulang" + support manual                                                       |
| Solo-dev bus factor                                   | Stagnasi            | Dokumen ini + runbook + ADR selalu mutakhir; PR kecil                                                                                   |

## 15. Lampiran D — Urutan, dependensi, estimasi indikatif

Urutan wajib: M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8. Paralelisasi yang aman: W6.1 (design system) boleh dicicil sejak M3; fixture prompt (W4.3) boleh disiapkan saat M3; provisioning staging (W7.1) boleh mulai saat M6.

Estimasi (1 developer fullstack + AI assistance, hari kerja efektif):

| Milestone | Estimasi                                   |
| --------- | ------------------------------------------ |
| M0        | 4–6                                        |
| M1        | 6–9                                        |
| M2        | 6–8                                        |
| M3        | 8–11                                       |
| M4        | 8–12                                       |
| M5        | 7–10                                       |
| M6        | 12–16                                      |
| M7        | 6–8                                        |
| M8        | 2–3                                        |
| **Total** | **±59–83 hari kerja (3–4 bulan kalender)** |

Estimasi adalah indikatif untuk perencanaan, bukan komitmen; gate kualitas tidak dikorbankan untuk mengejar angka ini.
