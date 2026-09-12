# Narraza v3 — Runbook Operasional (Rilis 1)

Penonton: pemilik/operator VPS staging & produksi. Prasyarat: akses SSH deploy user,
`DATABASE_URL` admin, dan kunci object storage di password manager (tidak pernah di repo).

## 1. Deploy rilis baru

Alur baku (`deploy/release.sh`): upload artefak → verifikasi checksum → drain worker
→ migrasi terkunci → symlink `current` → reload PM2 → readiness + smoke.

1. Bangun artefak dari commit yang CI-nya 8/8 hijau: `pnpm build`.
2. `deploy/release.sh <checksum-artifact>` — skrip berhenti bila checksum beda,
   migrasi terkunci proses lain, atau readiness gagal setelah reload.
3. Verifikasi: `curl https://<host>/api/readiness` harus `200` dan
   `migrationVersion` sama dengan `packages/db` terbaru.
4. Smoke produksi: daftar → verifikasi → masuk → 1 proyek internal end-to-end
   (lalu purge lewat jalur hapus akun).

## 2. Rollback

1. `deploy/release.sh --rollback <checksum-sebelumnya>` — symlink kembali, reload,
   readiness ulang. Migrasi bersifat expand-only sehingga rollback kode aman.
2. Bila migrasi terakhir bermasalah: JANGAN downgrade manual — kunci migrasi
   (`migration-runner-lock`) lalu perbaiki maju (forward-fix) dan rilis lagi.

## 3. Insiden kredit

- Gejala: selisih book vs held vs exposure (alert harian) atau pengguna lapor potongan.
- Periksa `creditLedger` vs `creditReservation` untuk `userId` terkait.
- Aturan: job tanpa output yang bisa dipakai → full release (nol-potongan, D4).
  Jangan kredit manual tanpa baris audit — pakai use case penyesuai bila tersedia,
  atau catat di `audit_events` via skrip yang sudah direview.
- Eskalasi: bekukan aksi berbayar (env) bila exposure melewati ambang, lalu hubungi pemilik.

## 4. Insiden job & outbox

- Job `dead`: cek lease/fence di `generation_jobs`; reclaim sweeper tiap 30 dtk
  seharusnya mengambil alih. `kill -9` worker di tengah job = skenario yang sudah
  diuji (`lease-fence-publish`): zombie tidak boleh publish.
- Outbox `dead`/`uncertain` > 1 jam: replay = generasi delivery baru dengan
  `dedupeKey` yang sama (jangan buat event baru).
- Alert 5-menitan: job dead baru, reservation `closing` > 6 jam, outbox
  dead/uncertain > 1 jam → email ops.

## 5. Backup & restore

- Nightly: `deploy/backup.sh` → `pg_dump` + artefak + manifest → object storage
  eksternal (terenkripsi age/GPG), retensi 30 hari, verifikasi ukuran + checksum
  otomatis. RPO ≤ 24 jam, RTO ≤ 4 jam. Backup TIDAK boleh hanya di VPS yang sama.
- Restore drill (terdokumentasi, dari salinan offsite ke VPS kosong):
  1. Provision VPS kosong (Ubuntu LTS, deploy user, UFW, fail2ban).
  2. Restore dump + artefak, jalankan migrasi (lock), readiness hijau.
  3. Catat RPO/RTO aktual di `docs/smoke/` dan minta tanda tangan pemilik.
- Drill pertama WAJIB sebelum peluncuran produksi (status: menunggu VPS — handoff).

## 6. Rotasi secret

`AUTH_SECRET`, `*_PEPPER`, Resend key, object-storage key: putar satu per satu
(duplikasi → deploy → revoke lama). Ganti `EMAIL_TOKEN_PEPPER` membatalkan token
aktif — umumkan maintenance 10 menit.

## 7. Troubleshooting

- E2E lokal `Terjadi kesalahan` saat daftar: (1) pastikan role DB e2e ada dan
  berpassword benar (`GRANT ALL` di database e2e); (2) `apps/web/.env.local`
  `SMTP_URL` harus `smtp://localhost:1025` (Mailpit), bukan 1026; (3) worker
  Playwright butuh `DATABASE_URL` dari root `.env` (dimuat via `dotenv/config`
  di `playwright.config.ts`); (4) bunuh dev server basi di :3000 bila env berubah.
- Vitest memindai `.worktrees`: root `vitest.config.ts` mengecualikannya.
- Kelas Tailwind terlihat mati (`text-primary` tak berefek): pastikan alias
  `--color-*` pendek ada di `globals.css` (Tailwind v4 menurunkan nama utilitas
  dari sufiks penuh); cane `tokens-resolve` untuk audit.

## 8. Checklist peluncuran produksi (tanda tangan pemilik)

- [ ] Vertical slice staging (AI + email asli) hijau.
- [ ] Restore drill offsite sukses & terdokumentasi.
- [ ] Kalibrasi kredit (`MICRO_IDR_PER_CREDIT` + grant awal) ditandatangani.
- [ ] W7.4 security checklist lengkap; tidak ada `service_restricted` di log.
- [ ] Copy legal final disetujui; artefak deploy = checksum yang lolos staging.

## 9. Catatan audit keamanan pra-rilis (2026-09-12)

- `pnpm audit`: 48 → 22 temuan setelah upgrade `next` 16.2.10 → 16.3.3 dan
  `nodemailer` 9.0.3 → 9.1.0 (patch dalam major yang sama, sesuai D7).
  Kritis (RCE Next) = 0. Sisa 12 high + 10 moderate semuanya di jalur
  dev/build-time (prisma dev, testcontainers, tailwind/postcss, rimraf/glob,
  driver mysql2 tak terpakai) — di luar bundle runtime produksi. Upgrade major
  toolchain prisma ditunda eksplisit ke pasca-R1.
- Secret scan: bersih (satu hit = base64 graph di Prisma generated client,
  false positive; tidak ada key/token di source terlacak).
- Verifikasi pasca-upgrade: typecheck web bersih, 108/108 unit web hijau,
  `next build` exit 0, client-bundle scan 26 file bersih, auth smoke E2E hijau.
- Celah terbuka (butuh VPS + kredensial, di luar repo): alert sweeper 5-menit
  D16 + rekonsiliasi ledger harian belum ada kodenya — tulis sebagai modul
  worker-gen + uji fault-injection tiap alert sebelum peluncuran, lalu catat
  di sini.
