# Audit Aksesibilitas Alur Utama (design.md §26) — M6

Tanggal: 2026-09-12 · Cakupan: landing, dashboard, fondasi, chat, cek, selesaikan, publish, kredit.
Metode: inspeksi sumber + pengukuran kontras terhitung (WCAG 2.1 formula) + gate statis `a11y-static`.

## Kontras AA (terukur, 14/14 lolos ≥ 4.50)

| Pasangan | Rasio | Status |
|---|---|---|
| ink-950 di putih | 17.27 | PASS |
| ink-700 di putih | 10.63 | PASS |
| muted di putih | 5.45 | PASS |
| muted di canvas | 5.23 | PASS |
| brand-strong di brand-soft | 8.40 | PASS |
| brand-ink di brand-soft | 11.06 | PASS |
| putih di action-primary | 5.01 | PASS |
| putih di status-danger | 5.61 | PASS |
| success di success-soft | 5.21 | PASS |
| warning di warning-soft | 4.62 | PASS |
| danger di danger-soft | 5.07 | PASS |
| info di info-soft | 4.64 | PASS |
| secondary di surface-soft | 9.56 | PASS |
| brand-100 di brand-ink (hero) | 9.95 | PASS |

## Checklist per layar (§26)

### Brand

- [x] Nama Narraza/Narra konsisten (layout metadata, Chat Narra, Usulan Narra).
- [x] Tanpa klaim berlebihan — halaman PRESENTATION memakai CapabilityNotice jujur.
- [x] Rose sebagai aksen (brand-soft/brand-100), bukan memenuhi layar.

### UX (landing, dashboard, fondasi, chat, cek, selesaikan, publish)

- [x] Tindakan utama jelas (satu CTA primer per layar, sisanya secondary/disabled jujur).
- [x] Langkah berikutnya terlihat (nextAction di dashboard/proyek; rekomendasi readiness).
- [x] Istilah teknis disederhanakan (usulan vs fakta terkunci; FindingCard berbahasa manfaat).
- [x] Usulan vs fakta terkunci dapat dibedakan (Badge "Usulan Narra" §15.7).
- [~] Mobile 375px nyaman — struktur responsif + bottom nav 5 tab ada; verifikasi visual penuh ikut E2E `vertical-slice-mobile` (leaf-1.2.1).

### UI

- [x] Body 16px di alur utama (`globals.css body font-size: 16px`); `text-xs` hanya untuk eyebrow/label.
- [x] Tap target ≥44px (Button/Chip/QuickReplies/Tabs `min-h-11`; nav `min-h-11`; gate `mobile-nav`).
- [x] Focus terlihat (global `:focus-visible` 3px `--focus-ring-color`; gate `a11y-static`).
- [x] Kontras AA (tabel di atas).
- [x] Empty state berkonteks + CTA (EmptyState primitif; dashboard; selesaikan/cek jujur).
- [x] Card tidak kosong tanpa tujuan (setiap Card punya heading + isi/aksi).

### AI trust

- [x] Konten AI berlabel (Badge "Usulan Narra"; FindingCard severity).
- [x] High-risk proposal berpola review (ProposalCard `risk=high` + catatan konfirmasi; tidak auto-accept).
- [~] Error menjelaskan kredit — copy "Kreditmu tidak dipotong" ada di matriks D4; wiring penuh saat job flow UI aktif (M7).
- [x] Tidak ada output yang otomatis menjadi canon (aksi disabled sampai backend tersedia).
- [ ] Dialog kunci fondasi (konsekuensi + ceklis) belum di-wire ke halaman — komponen `ConfirmationDialog` tersedia; wiring menyusul bersama aksi lock UI (catatan untuk M7).

### KBM/mobile serial

- [x] Progress serial terlihat (ProgressChecklist, Stepper, SignalPanel).
- [~] Preview HP saat relevan — ikut E2E mobile.
- [x] Bahasa sederhana untuk open loop/reveal (copy selesaikan/cek).

## Motion (§14)

- Durasi token `--motion-micro/panel/modal` (140/200/250ms) + `prefers-reduced-motion` di `globals.css` (gate `a11y-static`).
- `animate-pulse` Skeleton menghormati reduced-motion lewat media query global.
