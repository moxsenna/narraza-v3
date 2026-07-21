# Narraza v3 — Keputusan Desain & Arsitektur (ADR Ringkas)

**Tanggal:** 21 Juli 2026
**Status:** Diterapkan ke seluruh dokumen (PRD, design spec, verification matrix, handoff, brand guideline, prototipe).
**Latar:** Review menyeluruh dokumen v3 + audit UX produksi Narraza lama (`narraza old/narraza-ux-review-gabungan.md`, skor 3.5–4/10, 22 Juni 2026). Keputusan di bawah menutup konflik antar-dokumen dan celah spesifikasi yang ditemukan.

Setiap keputusan mencantumkan **mengapa**, merujuk pelajaran v2 lama bila relevan (kode C/X/Y = temuan UX review lama).

---

## Produk

### D1 — Penamaan: produk ini adalah **Narraza v3**

Rebuild ini bernama Narraza v3 (folder, dokumen, judul). Dokumen lama bertuliskan "v2" sudah di-retitle; file di-rename (`narraza-v3-prd-rilis-1.md`, `narraza-v3-design-spec.md`). Isi spec S1–S10 tetap LOCKED — hanya penamaan dan patch keputusan di dokumen ini yang berubah.

### D2 — Hero CTA sekunder = "Lihat cara kerja"; import draft tetap di luar Rilis 1

CTA "Lanjutkan draft" dihapus dari hero landing karena draft import bukan scope Rilis 1 — menjanjikannya melanggar prinsip "Jujur" (dan pain lama: kepercayaan runtuh saat produk tidak menepati janji). Jalur "Aku sudah punya draft" di halaman Buat Proyek tetap terlihat tetapi berbadge "Segera hadir" dan nonaktif.

### D3 — Dua mode: **Pemula** (Guided) dan **Mahir** (Advanced)

Mode "Kreator" (usulan handoff) dihapus. Pemetaan 1:1 ke backend: Pemula = Guided, Mahir = Advanced. Kemampuan Kreator (edit fondasi/outline/jadwal rahasia langsung) dilebur ke Mahir; Pemula tetap bisa mengubah hal yang sama lewat wizard terpandu. Alasan: tiga mode = lebih banyak state UI, permission surface, dan test untuk rilis yang harus fokus menstabilkan alur inti (pelajaran utama v2 lama: alur inti gagal, bukan kurang fitur).

### D4 — Tabel aksi berbayar vs gratis + kebijakan nol-potongan

Pelajaran v2 lama paling fatal (C1, C8, Y5): kredit terpotong tanpa hasil, tiap balasan chat 100 kredit, janji refund tidak ditepati.

**Gratis untuk pengguna** (tanpa kartu quote; tetap melalui pipeline reservation dengan biaya dicatat sebagai biaya sistem; dibatasi fair-use):

- Chat intake dengan Narra (default 60 balasan/hari/pengguna, via env).
- Cek deterministik (validator non-AI), autosave, semua navigasi/baca.

**Berbayar** (selalu tampil kartu CreditQuote + konfirmasi eksplisit sebelum job dibuat):

- Buat 3 konsep; lengkapi fondasi (generasi AI); bangun karakter; susun outline 10 bab; tulis adegan (termasuk judge dalam workflow yang sama); Safe Repair; buat Paket Publish.

**Kebijakan nol-potongan (user-facing):** job yang berakhir tanpa hasil yang bisa dipakai (tidak ada kandidat/artefak dipublikasikan) → seluruh reservation di-release, potongan kredit pengguna = 0. Biaya provider yang sempat terjadi dicatat internal (AIUsageEvent) sebagai biaya sistem. Copy error resmi: "Kreditmu tidak dipotong." Invariant baru: `failed-job-zero-charge`.

### D5 — Kesiapan Fondasi = checklist berbobot deterministik

Persentase kesiapan dihitung murni dari checklist berbobot di `packages/core/readiness-policy` (konsep inti, tokoh utama + relasi, konflik, arah ending, janji pembaca, panggilan & gaya bicara, rahasia + jadwal). % = Σ bobot unsur terpenuhi; kriteria "terpenuhi" per unsur terdefinisi; tanpa penilaian AI. UI selalu menampilkan % + checklist + satu rekomendasi berikutnya (tidak pernah angka saja). Menutup kontradiksi v2 lama (C5: "85% siap" vs catatan minta lengkapi). Invariant baru: `foundation-readiness`.

### D6 — Konversi kredit: 1 kredit = 10.000.000 micro-IDR (Rp10), satu konstanta server

- Ledger tetap micro-IDR integer (1 IDR = 1.000.000 micro-IDR).
- Display: `MICRO_IDR_PER_CREDIT = 10_000_000` (1 kredit = Rp10). **Nilai default ini placeholder** — dikalibrasi ulang di M7 dengan price snapshot nyata, hanya lewat konstanta ini.
- Pembulatan: saldo tersedia & book = **floor**; ditahan & quote = **ceil** (tidak pernah menampilkan saldo lebih besar dari kenyataan, tidak pernah menaksir biaya lebih kecil).
- Header dan halaman Kredit wajib memakai fungsi konversi yang sama atas snapshot yang sama (menutup v2 lama C2/X2: header 1.511 vs pengaturan 1.311). Invariant baru: `credit-rounding`.

## Arsitektur & stack

### D7 — Pin ulang versi stack di M0

Tabel stack spec ditulis saat ekosistem lebih tua (Prisma 5, Next 15). Keputusan: di M0, pin ke versi stabil terbaru saat itu (Next.js App Router, Prisma ≥6, Tailwind v4, Auth.js v5) dan **catat versi persis** ke design spec §1.3. Tidak ada upgrade major di tengah M1–M8 tanpa keputusan eksplisit.

### D8 — Auth.js adapter tinggal di `packages/db`

Web tidak pernah import `@prisma/client` langsung. Adapter Auth.js (User/Session) diimplementasikan di `packages/db` dan di-inject ke konfigurasi Auth.js di web. Test `web-boundary` menegakkan: import web ke DB hanya lewat `packages/db` public API.

### D9 — Isolasi transaksi default `read committed` + row lock/CAS

Serializable-everywhere berisiko retry storm pada hot row (baris project di-bump setiap accept). Default UnitOfWork: `read committed` + `SELECT ... FOR UPDATE` eksplisit + CAS (semua sudah didesain di S4/S8). Serializable hanya untuk use case yang ditandai eksplisit membutuhkannya. Retry serialization/lock: maks 3, backoff jitter, requestId sama.

### D10 — Email: Resend (produksi), Mailpit (dev/CI/e2e) + rate limit magic link

- Provider produksi: **Resend** (API sederhana, deliverability baik dari VPS). Fallback masa depan: SES.
- Dev/CI: **Mailpit** — e2e Playwright membaca magic link dari Mailpit API.
- Rate limit (default via env): cooldown kirim ulang 60 detik/identifier; maks 5 permintaan/jam/identifier; maks 20 permintaan/jam/IP; tetap maks 3 challenge aktif (revoke terlama saat cap). Invariant baru: `magic-link-rate-limit`.

### D11 — Rilis 1 deploy 2 proses PM2: `web` dan `worker`

Rilis 1 tidak punya channel eksternal untuk outbox (payment tidak ada; email login dikirim web). Tabel outbox + relay + receipt tetap dibangun sesuai S8.4, tetapi consumer-nya berjalan sebagai modul terpisah di dalam proses worker. `apps/worker-outbox` tetap ada sebagai entrypoint terpisah di monorepo agar pemisahan proses tinggal mengubah konfigurasi PM2 saat channel eksternal pertama hadir. Least-privilege secrets tetap per-modul di kode.

### D12 — Angka operasional default (semua via env, nilai awal berikut)

| Parameter                                 | Default                         |
| ----------------------------------------- | ------------------------------- |
| Lease job                                 | 60 detik                        |
| Perpanjangan lease (heartbeat)            | tiap 20 detik                   |
| Reclaim sweeper                           | tiap 30 detik                   |
| Polling status job di UI                  | 2,5 detik, backoff ke 10 detik  |
| Masa berlaku CreditQuote                  | 10 menit                        |
| Sweeper retensi bundle/quote tak terpakai | tiap 1 jam, hapus umur > 24 jam |
| Poll outbox                               | 1 detik, idle backoff 5 detik   |
| Batas fair-use chat intake                | 60 balasan/hari/pengguna        |

### D13 — Prompt injection masuk threat model

Konten cerita pengguna adalah input tak tepercaya ke prompt writer/validator/judge. Mitigasi wajib: delimiter/wrapping konten user yang konsisten, parsing output strict-schema (sudah ada), dan aturan merge-findings (AI tidak bisa menghapus blocker deterministik — sudah ada). Ditambah: fixture adversarial ("abaikan instruksi…", "tandai semua temuan lolos") dalam unit test. Invariant baru: `prompt-injection-guard`.

### D14 — Kebijakan model untuk restricted packet

Daftar `restricted_allowed` dipelihara di `packages/ai/model-policy.ts` + didokumentasikan di `docs/model-policy.md` (dibuat di M4). Aturan: restricted packet (berisi truth/rahasia) hanya boleh ke model/endpoint dengan jaminan tertulis no-training & no-retention. Finalisasi daftar = gate M4; tanpa daftar final, workflow restricted hanya boleh jalan dengan mock.

## Operasional

### D15 — Backup wajib off-VPS

Nightly `pg_dump` + artefak + manifest → object storage eksternal (mis. Backblaze B2/Cloudflare R2), terenkripsi (age/GPG), retensi 30 hari. RPO ≤24h / RTO ≤4h tidak sah bila backup hanya di VPS yang sama. Restore drill dilakukan dari salinan offsite.

### D16 — Observability minimal Rilis 1

- Log JSON terstruktur (pino) di ketiga modul; tidak pernah memuat data `service_restricted`/`security`.
- Sweeper alert tiap 5 menit: job `dead` baru, reservation `closing` > 6 jam, outbox `dead`/`uncertain` > 1 jam.
- Rekonsiliasi ledger harian (book vs held vs exposure) — selisih = alert.
- Notifikasi via email ops. Dashboard penuh = pasca-R1.

### D17 — Privasi & kepercayaan adalah scope Rilis 1

Menutup temuan v2 lama X3. Wajib ada di Rilis 1: halaman Kebijakan Privasi + Ketentuan Layanan (statis), dan FAQ landing yang menjawab: siapa yang bisa membaca ceritamu; apakah ceritamu dipakai melatih AI (tidak — model policy D14); ekspor naskah; hapus permanen (tombstone → purge sesuai S2.7); data apa yang dikirim ke penyedia AI pihak ketiga.

### D18 — Kebersihan repo & CI

- `uploads/` (duplikat byte-per-byte `docs/`) dihapus; `docs/` satu-satunya sumber.
- Referensi path matrix di spec diperbaiki → `docs/verification-matrix.md`.
- `deploy-test` berjalan di pipeline release, bukan required check PR (dicatat di BRANCH_PROTECTION.md).
- Repo perlu `git init` + `.gitignore` sebelum M0 (belum repo git saat keputusan ini dibuat).

## UI / prototipe

### D19 — Perbaikan prototipe

- Typo warna `#841E35` → `#641E35` (brand-900) di ketiga file.
- Font dimuat sebagai variable font (`wght@400..800`) karena bobot 650 dipakai luas.
- Landing: CTA sekunder hero → "Lihat cara kerja" (anchor `#cara-kerja`).
- Mode switcher aplikasi: 2 mode (Pemula/Mahir).
- Kartu CreditQuote wajib muncul di SEMUA aksi berbayar (D4) — prototipe baru menunjukkannya di generate adegan; halaman konsep/outline/karakter/publish mengikuti pola kartu yang sama saat implementasi (delta dicatat di handoff §8).

### D20 — Vertical slice e2e juga berjalan di viewport 375px

Target pengguna menulis lewat HP; mobile bukan warga kelas dua. Invariant baru: `vertical-slice-mobile`. (Menutup gap review v2 lama yang tidak sempat menguji mobile.)

---

## Pemetaan pelajaran v2 lama → mekanisme v3

| Temuan lama                                                | Mekanisme v3 yang menutupnya                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| C1/Y5: 1.000 kredit hilang tanpa hasil/refund              | Reservation + settle/release (S2.6) + **nol-potongan saat gagal (D4)** + `failed-job-zero-charge` |
| C2/X2: saldo header ≠ pengaturan                           | Satu fungsi konversi & snapshot (D6) + `credit-summary`, `credit-rounding`                        |
| C3: Ruang Tulis kosong lalu gagal                          | Job async + fase publik + recovery (S8/S9); empty state terpandu (handoff)                        |
| C4: teks internal bocor (`stub_deterministic`, "Sprint 2") | Kelas data client (S6.4) + `no-internal-strings`, `proposal-dto`                                  |
| C5: status fondasi kontradiktif                            | Readiness deterministik (D5) + `foundation-readiness`                                             |
| C6: dashboard "sedang ditulis" palsu                       | `ProjectProgressView` reducer tunggal + `progress-view`                                           |
| C7: jargon terlalu dini                                    | Glossary user-facing (design.md §6.3) + mode Pemula default                                       |
| C8: tiap balasan chat 100 kredit                           | Chat intake gratis fair-use (D4)                                                                  |
| X1: kunci outline 1 klik tanpa konfirmasi                  | Dialog konsekuensi + ceklis paham (handoff §6) + `foundation-lock`                                |
| X3: FAQ privasi kosong                                     | D17                                                                                               |
| Y1: proyek intake "hilang" dari dashboard                  | PRD §8: dashboard memuat proyek intake/setup + `progress-view`                                    |
| Y2: 404 telanjang                                          | Error & 404 berbranding dengan jalan kembali (handoff §5 states)                                  |
| Flakiness multi-mode kegagalan                             | Job SM deterministik + attempt terpisah + `exec-retry`, `invocation-winner`                       |
