# Narraza v3 — Frontend Design Handoff

Status: Direvisi sesuai DECISIONS.md · 21 Jul 2026
Sumber kebenaran: DECISIONS.md > PRD Rilis 1 (narraza-v3-prd-rilis-1.md) > verification-matrix.md > narraza-v3-design-spec.md (S1–S10) > design.md (brand) > asumsi desain (tercatat di §8).

Artefak desain:

- `narraza-landing.dc.html` — landing page + seluruh state autentikasi. **Catatan (D21):** prototipe ini masih menunjukkan flow magic link lama; UI implementasi mengikuti §1.1 dan §2 di dokumen ini (email+password), bukan prototipe untuk layar auth. Refresh visual prototipe menyusul sebagai task terpisah.
- `narraza-app.dc.html` — prototipe aplikasi penuh (desktop), semua halaman proyek + demo-state switcher per halaman.
- `narraza-mobile.dc.html` — layar kunci mobile 375px dengan bottom nav.

---

## 1. Audit requirement (ringkas)

Dari PRD + spec S1–S10 + verification matrix, requirement yang punya representasi UI:

1. **Auth (D21)**: daftar email+password → verifikasi email dua tahap (kirim → cek email → konfirmasi POST) sebelum akun aktif penuh, maks 3 token aktif per purpose, sesi idle 14 hari. Login = form email+password langsung (tanpa round-trip email). "Lupa kata sandi" ADA: request → cek email → konfirmasi POST → password baru → semua sesi lama dicabut.
2. **Dashboard**: `ProjectProgressView` = satu-satunya sumber stage, blocker, next action, counts. CTA dashboard dan redirect memakai reducer yang sama. Tidak ada status "sedang menulis" palsu.
3. **Intake → Konsep**: percakapan dengan Narra; hasil tangkapan berlabel draft (bukan canon); 3 konsep alternatif; accept konsep → foundation **draft** (belum lock).
4. **Fondasi**: confirm dan lock terpisah; lock butuh dialog konfirmasi dengan konsekuensi; Kesiapan Fondasi = persentase + checklist + rekomendasi (bukan skor tanpa penjelasan).
5. **Outline**: 10 bab pertama; hierarki Roadmap → Mini Arc → Bab → Adegan; update outline terkunci jika sudah ada accepted prose di hilirnya (`outline-downstream`).
6. **Jadwal Rahasia**: truth = author_private, tidak otomatis writer-visible; timeline breadcrumb → forbidden-before → target reveal.
7. **Ruang Tulis**: web tidak memanggil LLM — tombol generate membuat job async; fase job publik tanpa persen palsu; job pulih setelah refresh; JOB_ALREADY_ACTIVE menunjuk job aktif; 1–3 kandidat; working draft autosave CAS (konflik ditampilkan); ValidationReport basi setelah edit (hash berubah).
8. **Cek Cerita**: `passed = tanpa temuan blocking`; blocker deterministik tak bisa dihapus temuan AI; override hanya untuk temuan yang di-allowlist server; pesan publik via kode i18n, detail internal tidak pernah tampil.
9. **Safe Repair**: arahan tersanitasi; berhenti pada no-progress/limit; hasil = versi baru + proposal baru, tidak pernah auto-accept.
10. **Proposal/Canon**: sumber ai|user|system; PublicProposalView hanya diff tersanitasi + aksi dari server; accept = versi canon +1 tepat sekali; bump global tak membatalkan proposal (validitas berbasis dependensi); sibling proposal superseded; user-edited prose → proposal source=user.
11. **Kredit**: quote server-frozen sebelum konfirmasi; reserve sebelum panggilan provider; gagal = kredit dikembalikan; tampilan available / ditahan / sedang direkonsiliasi; tier hanya Hemat/Seimbang/Terbaik; header kredit = snapshot settings.
12. **Publish**: ArtifactProposal, tidak mengubah versi canon; dari accepted prose saja.
13. **Keamanan UI**: tanpa model ID, token, prompt mentah, service_restricted, ID internal sebagai info utama; IDOR → "tidak ditemukan".
14. **A11y**: keyboard, focus ring, tap target ≥44px, reduced motion, AA.

## 2. Sitemap

```
Publik
├─ Landing (hero, masalah, cara kerja, fitur, untuk siapa, contoh alur, kredit, trust, CTA)
└─ Masuk (email+password) / Daftar (email+password) → [Daftar] Cek email → Verifikasi (loading|sukses|kedaluwarsa|error)
                                                    → [Lupa password] Cek email → Reset (form password baru|sukses|kedaluwarsa|error)

Global (setelah masuk)
├─ Dashboard (daftar proyek, kredit ringkas, aktivitas)
├─ Buat Proyek (5 jalur entry)
└─ Import Draft (fase berikutnya — flow tetap didesain)

Proyek  (sidebar dikelompokkan)
├─ PERSIAPAN   : Beranda Proyek · Chat Narra · (Pilih Konsep) · Fondasi Cerita · Karakter
├─ PERENCANAAN : Rencana Bab · Jadwal Rahasia · Fakta
├─ PENULISAN   : Ruang Tulis
├─ PEMERIKSAAN : Cek Cerita (+ Safe Repair) · Tutup Bab
├─ PUBLIKASI   : Paket Publish
└─ LAINNYA     : Kredit & Penggunaan · Pengaturan
```

## 3. Information architecture

- **Mode [D3]**: dua mode — Pemula (default; wizard + bahasa manfaat; = Guided) · Mahir (edit fondasi/outline/jadwal rahasia langsung, label operasi proposal, panel bahan aman AI, inspector; = Advanced). Mode "Kreator" dihapus. Mode global di sidebar bawah, per-user.
- **Progressive disclosure**: halaman menampilkan lapisan ringkas dulu; detail lewat "Lihat alasan", expand bab, drawer temuan, inspector Mahir.
- **Satu aksi primer per layar** (design.md §5.3); aksi primer selalu dari next action reducer.
- **Istilah**: hanya nama user-facing (§6.3 design.md) di UI; istilah internal hanya di tooltip Mode Mahir.

## 4. User flow per persona

1. **Pemula 0-skill**: Landing → Mulai dari ide → daftar email+password → verifikasi email → Dashboard kosong → Buat Proyek "Aku belum punya ide" → Chat Narra (quick reply, sinyal cerita terkumpul) → 3 Konsep → pilih → Fondasi draft → lengkapi via rekomendasi → Lock (dialog) → Susun 10 Bab → Ruang Tulis (arahan adegan terisi otomatis) → generate (quote → job) → pilih kandidat → Cek Cerita → Terima Versi → Tutup Bab → Paket Publish.
2. **Punya ide kasar**: Buat Proyek "Aku punya ide kasar" → chat langsung menceritakan premis → sama seperti di atas, lebih cepat ke konsep.
3. **Punya draft**: Buat Proyek "Aku sudah punya draft" → Import (paste/upload) → analisis → kartu hasil ekstraksi (karakter/fakta/timeline/gaya/plot hole) → semua sebagai usulan → approve → lanjut outline/menulis.
4. **Penulis berpengalaman**: mode Mahir → edit fondasi/fakta/reveal langsung (author_private) → outline manual + reorder → Ruang Tulis dengan panel bahan aman & inspector → review diff operasi proposal → override temuan yang diizinkan server.

### 4.1 Aksi berbayar vs gratis (D4) — wajib konsisten di seluruh UI

| Aksi                                                                                                                             | Biaya                                      | UI                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Chat intake dengan Narra                                                                                                         | Gratis (fair-use, default 60 balasan/hari) | Tanpa kartu quote; sisa fair-use tampil halus bila mendekati batas                                         |
| Buat 3 konsep · lengkapi fondasi (AI) · bangun karakter · susun outline 10 bab · tulis adegan · Safe Repair · buat Paket Publish | Berbayar                                   | Kartu CreditQuote (perkiraan maksimum + kedaluwarsa) + tombol Konfirmasi — pola yang sama di semua halaman |
| Cek deterministik, autosave, navigasi/baca                                                                                       | Gratis                                     | Tanpa indikator biaya                                                                                      |

Janji tetap di semua jalur gagal: **"Kreditmu tidak dipotong"** — job tanpa hasil = release penuh (`failed-job-zero-charge`). Setiap tombol berbayar menampilkan perkiraan biaya sebelum konfirmasi (pelajaran v2 lama C1/C8).

## 5. Design system (implementasi dari design.md)

Token warna, radius, shadow, tipe: lihat design.md §9–§11, §25 (sudah final, dipakai apa adanya). Font UI Plus Jakarta Sans, editorial/prose Lora. Ringkasan komponen yang dipakai prototipe:

| Komponen                              | Spesifikasi kunci                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Button primary                        | 44–48px, `brand-600`, radius 12, hover `brand-700`, satu per area                                                                 |
| Button secondary/tertiary/destructive | putih+border / teks brand-700 / `danger-700` label spesifik                                                                       |
| Input                                 | ≥44px, label selalu tampak, focus ring `brand-300`                                                                                |
| Card                                  | putih, border `line-200`, radius 16, padding 20–24                                                                                |
| Chip status                           | pill; Siap=success, Perlu ditinjau=warning, Terkunci=ink, Rahasia=plum, Kemenangan kecil=amber, Open loop=info                    |
| Chat bubble                           | Narra=`brand-50/100` + ikon N; user=putih border                                                                                  |
| Kartu Usulan Narra                    | label "Usulan Narra" → isi → dampak → risiko → Terima/Ubah/Tolak; high-risk: border danger + konfirmasi ekstra                    |
| Temuan validator                      | judul manfaat, badge Lolos/Perlu ditinjau/Menghambat, lokasi teks, alasan, dampak, aksi (Perbaiki otomatis/Abaikan+alasan/Tandai) |
| Kredit                                | header: tersedia · ditahan · rekonsiliasi; quote card sebelum generate                                                            |
| Job phase                             | label fase (Menyiapkan bahan → Menulis → Memeriksa → Menyusun usulan), tanpa persen                                               |
| Skeleton/empty/error/toast            | tiap halaman, lihat demo-state switcher di prototipe                                                                              |

## 6. Interaction notes

- **Lock Fondasi**: dialog konfirmasi menjelaskan konsekuensi + apa yang masih bisa diubah; ceklis "Aku mengerti" sebelum tombol aktif.
- **Generate adegan**: klik → kartu CreditQuote (perkiraan maksimum, kedaluwarsa) → Konfirmasi → job phases → refresh-safe (banner "Melanjutkan proses yang berjalan"). Batal saat queued mengembalikan kredit; batal saat running = label "menyelesaikan pembatalan".
- **Kandidat**: 1–3 tab kandidat; pilih → jadi working draft; edit manual mengubah label versi menjadi "Diedit kamu" dan menandai hasil cek basi.
- **Proposal high-risk** (kehamilan/kematian/keluarga/pernikahan/rahasia utama): aksi Terima memerlukan konfirmasi kedua; tidak pernah satu klik.
- **Autosave CAS**: status "Tersimpan otomatis · 2 detik lalu"; konflik → banner pilih versi.
- **Outline terkunci hilir**: bab dengan accepted prose menampilkan kunci + alasan; edit diarahkan ke flow proposal.
- **Reveal warning**: adegan yang menyentuh rahasia sebelum forbidden-before → warning plum dengan bab target.
- **Keyboard**: fokus ring 3px brand-300; modal focus trap; esc menutup drawer.

## 7. Mapping ke verification-matrix (baris yang punya representasi UI)

| Invariant                                                         | Representasi UI                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| progress-view                                                     | Dashboard CTA & Beranda Proyek memakai next action yang sama                                    |
| concept-accept                                                    | Setelah pilih konsep: banner "Fondasi masih draft — tinjau lalu kunci"                          |
| foundation-lock                                                   | Dialog konfirmasi lock + ceklis pemahaman                                                       |
| outline-downstream                                                | Bab beraccepted-prose terkunci dari edit biasa                                                  |
| command-no-ai / request-beat-snapshot / credit-quote-plan-binding | Kartu CreditQuote muncul sebelum job; konfirmasi memakai quote yang sama                        |
| credit-quote (one-time)                                           | Quote kedaluwarsa → tombol "Minta perkiraan baru"                                               |
| job-recovery                                                      | Banner pemulihan job aktif setelah refresh (demo state)                                         |
| cancel-queued / tombstone-mid-attempt                             | Aksi Batalkan + status "menyelesaikan pembatalan"                                               |
| retry-new-job                                                     | Gagal → "Coba lagi" membuat proses baru; riwayat tetap                                          |
| working-draft (CAS)                                               | Banner konflik simpanan                                                                         |
| validation-hash                                                   | Badge "Hasil cek sudah tidak sesuai — jalankan ulang" setelah edit                              |
| merge-findings                                                    | Temuan blocking tidak punya tombol abaikan; hanya temuan allowlist                              |
| override-allowlist                                                | "Abaikan dengan alasan" hanya di temuan tertentu                                                |
| repair-policy / repair-reextract                                  | Layar Safe Repair: aturan yang dijaga + before/after + berhenti otomatis                        |
| accept-proposal / prose-accept-order                              | Tutup Bab: semua perubahan fakta/pengetahuan direview lalu satu aksi "Terapkan & jadikan resmi" |
| proposal-unrelated-version-bump                                   | Usulan lama tetap valid; hanya usulan dengan dependensi berubah berlabel "perlu ditinjau ulang" |
| user-proposal                                                     | Edit manual → label "Diedit kamu", diajukan sebagai perubahan darimu                            |
| publish-artifact                                                  | Paket Publish berlabel "tidak mengubah cerita resmi"                                            |
| proposal-dto / no-internal-strings                                | Tidak ada ID/istilah internal di seluruh copy                                                   |
| idor / active-user-guard                                          | State "Proyek tidak ditemukan" generik                                                          |
| auth-register-verify / email-token-cap                            | Layar cek email (verifikasi) + batas kirim ulang (maks 3 token aktif)                           |
| auth-login / login-lockout                                        | Form masuk email+password; blokir sementara setelah percobaan gagal berulang                    |
| auth-password-reset                                                | Layar cek email (reset) → form password baru → semua sesi lama dicabut                          |
| credit-summary                                                    | Header kredit = angka halaman Kredit                                                            |

## 8. Asumsi desain (di luar dokumen)

1. Proyek contoh: "Serpihan Janji" — drama rumah tangga, 60 bab target, tokoh Maya/Raka/Bu Ratna; dipakai untuk seluruh copy realistis.
2. Kredit ditampilkan sebagai angka bulat "kredit"; konversi & pembulatan mengikuti D6 (1 kredit = MICRO_IDR_PER_CREDIT; floor untuk tersedia, ceil untuk ditahan/quote; satu fungsi konversi untuk header dan halaman Kredit).
3. Dua mode user-facing (Pemula/Mahir) memetakan 1:1 ke Guided/Advanced backend (D3). _(Direvisi dari tiga mode.)_
4. Jadwal Rahasia divisualkan sebagai jalur horizontal per-bab (breadcrumb → zona terlarang → target reveal).
5. Import Draft didesain penuh tetapi berlabel "Segera hadir" dan nonaktif (di luar Rilis 1); landing tidak menjanjikannya — CTA sekunder hero = "Lihat cara kerja" (D2).
6. Fase job publik: Menyiapkan bahan → Menulis adegan → Memeriksa hasil → Menyusun usulan.
7. Bottom nav mobile: Beranda · Rencana · Tulis · Cek · Lainnya.
8. Logo placeholder: wordmark + penanda buku (diamond rose); logo final di P2.

## 9. Handoff notes untuk developer

- Semua warna/spacing/radius mengikuti token design.md §25 — jangan hardcode pink/gray Tailwind, pakai semantic mapping.
- Setiap halaman prototipe punya **demo-state switcher** (strip di atas konten) — itu alat desain, bukan bagian produk.
- Aksi primer per halaman dibaca dari `ProjectProgressView.nextAction`; jangan menghitung sendiri di client.
- Copy di prototipe adalah copy final yang disarankan (bukan lorem ipsum) — pindahkan ke i18n/message codes.
- Semua drawer/dialog: focus trap, esc, tombol tutup berlabel.
- Breakpoint: layout mobile di prototipe mobile berlaku < 768px; desktop app layout ≥ 1024px; di antaranya, panel samping menjadi drawer.
- **Delta prototipe vs keputusan (D19)**: prototipe baru menampilkan kartu CreditQuote di generate adegan — saat implementasi, pola kartu yang sama wajib dipakai di SEMUA aksi berbayar (§4.1). Mode switcher prototipe sudah 2 mode (Pemula/Mahir). Kesiapan Fondasi "82%" di prototipe mengikuti formula deterministik D5 saat implementasi.
- **Halaman tambahan Rilis 1 (D17)**: Kebijakan Privasi + Ketentuan Layanan (statis) + blok FAQ privasi di landing (siapa yang bisa membaca cerita, no-training, ekspor, hapus permanen, data ke penyedia AI pihak ketiga). Belum ada di prototipe — desain menyusul pola halaman statis sederhana.
- **E2E**: vertical slice dijalankan di desktop dan viewport 375px (`vertical-slice-mobile`, D20).
