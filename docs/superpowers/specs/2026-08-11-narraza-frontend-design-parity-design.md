# Narraza Frontend Design Parity — Approved Design Specification

**Tanggal:** 11 Agustus 2026  
**Status:** DISETUJUI untuk perencanaan dan implementasi bertahap  
**Scope:** cakupan frontend penuh dan parity desain; bukan frontend fungsional penuh  
**Branch target:** `feat/frontend-foundation`  
**Worktree target:** `D:\Coding\Narraza Fix\Narraza v3\.worktrees\feat-frontend-foundation`

## 0. Ringkasan keputusan

Narraza membutuhkan bahasa visual, struktur navigasi, state, dan kontrak interaksi lengkap untuk seluruh Rilis 1 sebelum semua use case backend tersedia. Pekerjaan ini membuat setiap tujuan rute dapat ditinjau dan diuji tanpa memalsukan kemampuan. Halaman yang sudah didukung M2 tetap memakai data dan aksi nyata. Halaman masa depan menjadi shell presentasi jujur dengan aksi nonaktif.

Hasil yang disetujui:

- cakupan visual seluruh IA desktop dan mobile;
- parity komposisi dengan tiga referensi DC lokal;
- preservasi alur M2, auth, ownership, dan invariant arsitektur;
- metadata capability yang dapat dieksekusi;
- resolver konteks deterministik dan fail closed;
- preview statis hanya melalui gate server-only;
- empat PR kecil, berurutan atau stacked, tanpa memperlemah test.

Tidak ada pernyataan dalam dokumen ini yang berarti pekerjaan frontend tersebut sudah selesai. Semua butir adalah kontrak implementasi berikutnya.

## 1. Goal, pengguna, dan tujuan bisnis

### 1.1 Masalah

Frontend saat ini membuktikan auth, shell awal, dashboard/proyek, dan alur user-origin M2, tetapi belum memberi coverage desain untuk alur Rilis 1 sampai tulis, cek, tutup bab, naskah, dan publish. Referensi DC menunjukkan tujuan visual lengkap, sementara kemampuan backend datang bertahap. Tanpa kontrak parity, implementasi berisiko:

- mengubah domain agar cocok dengan demo;
- menampilkan keberhasilan palsu;
- memilih project/chapter secara arbitrer;
- menggandakan state machine backend di client;
- merusak selector dan guard M2 yang sudah diuji;
- menyatukan quote, reservation, job, ledger, draft, dan artifact menjadi satu status UI ambigu.

### 1.2 Target pengguna

- Penulis serial Indonesia, terutama pemula dan semi-serius, memakai ponsel atau berpindah ke desktop.
- Penulis Mahir yang membutuhkan struktur canon, outline, fakta, dan jadwal rahasia tanpa paparan data `service_restricted`.
- Reviewer produk, desain, QA, dan engineer yang perlu menilai cakupan visual sebelum capability backend lengkap.

### 1.3 Tujuan bisnis

- Mempercepat review desain seluruh Rilis 1 tanpa mengklaim fitur backend tersedia.
- Menjaga kepercayaan: status, biaya, kegagalan, dan keterbatasan selalu jujur.
- Mengurangi rework M6 melalui IA, token, komponen, responsive rules, dan kontrak route yang terkunci lebih awal.
- Melindungi investasi M0–M3: auth, tenant isolation, `ProjectProgressView`, readiness, foundation lock, outline guard, job state machine, dan CI tetap authoritative.

### 1.4 Goal dan non-goal

**Wajib:** full frontend coverage/design parity. Semua rute kanonis memiliki komposisi, state contract, responsive intent, dan capability semantics.

**Bukan goal:** full functional frontend. Pekerjaan tidak harus menghubungkan AI, generation workflow, credit engine, working draft, validation, proposal accept, atau publish artifact yang use case-nya belum tersedia.

**Wajib pada PR4:** dokumentasi screenshot visual per acceptance viewport. **Opsional bila tidak memperlebar PR:** automated visual regression untuk galeri preview.

**Di luar scope:**

- payment gateway, draft import, KBM export, kolaborasi tim, BYOK, raw prompt editor, model-ID picker;
- route beat terpisah;
- flow impor fungsional dan halaman Panduan Uji Coba;
- perubahan domain, schema, migration, auth, AI, job, ledger, atau persistence demi demo;
- menyelesaikan M4–M8 melalui data fixture;
- redesign primary checkout atau perubahan file di luar worktree fitur.

## 2. Baseline dan bukti repository

### 2.1 Preflight terkunci

Baseline harus dicatat apa adanya, bukan disebut bersih:

- branch `feat/frontend-foundation` dibuat dari `origin/master` pada `a946439`, commit `Merge pull request #7 from moxsenna/feat/m3-job-state-machine`;
- package unit/type tests lulus: `@narraza/shared` 11, `@narraza/core` 670, `@narraza/application` 26, total 707;
- source assertion `apps/web/src/app/m0-w05.test.ts` lulus;
- root `pnpm lint` gagal sebelum perubahan karena ESLint memindai nested worktrees dan melaporkan `ambiguous tsconfigRootDir`;
- kegagalan lint tersebut baseline tooling/repository, bukan alasan menghapus lint, mengecualikan file produk sembarang, atau mengklaim baseline hijau.

### 2.2 Fakta repository yang membatasi desain

- `README.md` menetapkan web sebagai Next.js App Router adapter dan dependency direction adapters → application → core/ports; web tidak mengimpor Prisma langsung.
- `package.json` root menyediakan `dev`, `build`, `test`, `test:unit`, `test:integration`, `test:contract`, `test:tooling`, `e2e`, `lint`, `format:check`, `typecheck`, `arch`, migration scripts, `security:env-boundary`, dan `security:client-bundle`.
- `apps/web/package.json` memakai Next `16.2.10`, React `19.2.7`, Tailwind `4.3.3`, dan `server-only`.
- `.github/workflows/ci.yml` berjalan untuk push/PR ke `master`, Node 22, pnpm 11.9.0, PostgreSQL 16 pada migration/E2E, dan Mailpit pada E2E.
- `apps/web/src/app/app/layout.tsx` mengautentikasi sekali melalui `getCurrentUser()` lalu `redirect('/masuk')`; shell sekarang menampilkan enam grup disabled.
- `apps/web/src/server/domain/queries.ts` memakai `authorizeActiveUser`, query tenant-scoped, `projectProgressView`, dan `server-only`.
- seluruh halaman project saat ini membaca `projectId`, memanggil `getMyProject(projectId)`, lalu `notFound()` jika bukan milik user atau tidak ada.
- `tests/e2e/idor.spec.ts` menuntut foreign dan random project identik sebagai branded `NOT_FOUND`, termasuk mutation tampering.
- `apps/web/src/app/m0-w05.test.ts` mengunci hero/CTA/legal, satu auth guard shell, enam grup navigasi, item label, dashboard list/create, serta branded legal/not-found/error.
- current route files tersedia untuk `/`, `/masuk`, `/daftar`, `/lupa-password`, `/reset-password/baru`, `/reset-password/konfirmasi`, `/verifikasi/konfirmasi`, `/verifikasi/selesaikan`, `/privasi`, `/ketentuan`, `/app`, `/app/proyek/baru`, `/app/proyek/[projectId]`, dan enam rute project M2: `chat`, `fondasi`, `outline`, `karakter`, `fakta`, `rahasia`.

## 3. Urutan otoritas

Jika sumber bertentangan, gunakan urutan berikut:

1. **Behavior/domain yang sudah diterapkan dan invariant teruji:** ownership, auth, readiness, canonical writes, `ProjectProgressView`, downstream lock, job/credit semantics.
2. **Dokumen produk/arsitektur:** `docs/DECISIONS.md`, PRD, verification matrix, `docs/narraza-v3-design-spec.md`, `docs/implementation-plan.md`.
3. **Brand/product design:** `docs/design.md`.
4. **DC visual structure:** `narraza-landing.dc.html`, `narraza-app.dc.html`, `narraza-mobile.dc.html`.
5. **Frontend lama:** hanya pola yang masih konsisten dengan sumber lebih tinggi.

DC mengontrol appearance, composition, hierarchy, density, component arrangement, dan responsive intent. DC tidak pernah mengontrol persistence, route identity, domain lifecycle, authorization, AI execution, security, credit settlement, atau tenant resolution. Demo-state switcher dan Panduan uji dalam DC bukan produk.

## 4. Isolasi dan hard boundaries

### 4.1 Isolasi kerja

- Semua perubahan dilakukan hanya dalam `D:\Coding\Narraza Fix\Narraza v3\.worktrees\feat-frontend-foundation`.
- Primary checkout `D:\Coding\Narraza Fix\Narraza v3` tidak disentuh, tidak dibersihkan, tidak di-reset, dan tidak dijadikan tempat generate artefak.
- Spec lock commit boleh berada pada branch PR1 `feat/frontend-foundation` dan dipush untuk review.
- Implementasi berikutnya tetap mengikuti scope dan commit sequence PR1. Tidak boleh menyelundupkan perbaikan domain atau lint baseline yang tidak dibutuhkan PR.

### 4.2 Hard boundaries

- Tidak ada perubahan schema, migration, repository contract, use case semantics, auth/session, job SM, ledger, AI projector, atau model policy untuk mencapai parity visual.
- RSC dan route adapter tidak boleh mengakses Prisma langsung.
- Existing M2 reads/actions tetap melalui application/public DB boundary yang berlaku.
- Future shell tidak menulis DB, tidak membuat job, tidak reserve/settle kredit, dan tidak membuat artifact.
- Tidak ada `localStorage`, fixture, first-array selection, atau query tanpa ownership untuk memilih konteks.
- Tidak ada fake toast sukses, fake autosave, fake progress %, fake credit deduction/refund, fake generated prose, atau fake canon update.
- Existing test/selectors/guards dipertahankan atau dimigrasikan dengan compatibility assertion; test tidak dihapus atau dilemahkan.

## 5. Inventaris referensi visual dan klasifikasi

| Referensi | Isi teramati | Penggunaan | Klasifikasi |
|---|---|---|---|
| `narraza-landing.dc.html` | Hero “Tulis serial panjang tanpa kehilangan arah.”, masalah, enam langkah, trust, CTA, visual auth lama | Struktur landing, hierarchy, marketing composition; auth hanya visual styling | **REFERENCE FOUND** untuk landing; **ADAPTED** untuk auth email+password D21 |
| `narraza-app.dc.html` | Dashboard states, buat proyek/import, konsep, fondasi, karakter, fakta, outline, naskah, tulis, cek, repair, tutup bab, publish, kredit, pengaturan, Panduan uji | Komposisi desktop dan state inventory | **REFERENCE FOUND** untuk layar produk; Panduan/import flow **INTENTIONAL DEVIATION** |
| `narraza-mobile.dc.html` | Dashboard, chat, rencana, tulis, cek, publish; bottom nav Beranda/Rencana/Tulis/Cek/Lainnya | Responsive intent 375 px pada rute yang sama | **REFERENCE FOUND** |
| Current auth/public pages | Auth email+password, reset, two-step verification, legal, branded errors | Behavior dan selector yang wajib dipertahankan | **ADAPTED** terhadap visual landing DC |
| Current M2 pages | Project create, persisted chat, foundation draft/confirm/lock, outline user-origin, karakter/fakta/rahasia read | Data/aksi nyata sebagai dasar parity | **ADAPTED**; visual DC diterapkan tanpa mengganti behavior |
| Chapter-addressed route shell | `projectId + chapterId` pada tulis/cek/selesaikan/naskah/publish | Menghilangkan pemilihan bab arbitrer | **NEW SYSTEM-ONLY COMPONENT**: resolver, context banner, reason-state |
| Capability notice dan disabled action contract | Penanda REAL/PRESENTATION/DISABLED | Kejujuran availability lintas route | **NEW SYSTEM-ONLY COMPONENT** |
| Dev-only preview gallery | Scenario statis tenant-free di balik gate server-only | Review visual semua state | **NEW SYSTEM-ONLY COMPONENT** |
| Import Draft | DC punya flow analisis penuh, D2 mengecualikan Rilis 1 | Intent disabled pada `/app/proyek/impor`; tanpa analisis, upload, persistence, atau success path | **INTENTIONAL DEVIATION** |
| Panduan uji/demo switcher | Ada pada app DC | Tidak dibangun di produk | **INTENTIONAL DEVIATION** |
| Beat route | DC menampilkan detail adegan dalam flow | Tidak ada route `/beat/[beatId]`; beat tetap data di chapter route | **INTENTIONAL DEVIATION** |

Setiap implementasi halaman harus mencatat satu klasifikasi di review PR. Ketiadaan referensi tidak memberi izin membuat komponen domain baru; gunakan **NEW SYSTEM-ONLY COMPONENT** hanya untuk kebutuhan sistem frontend seperti resolver, capability notice, atau preview gate.

## 6. Capability semantics dan metadata executable

### 6.1 Tiga nilai capability

- **REAL:** route membaca data tenant nyata dan/atau menjalankan aksi nyata yang use case-nya tersedia. Loading, error, validation, permission, dan mutation harus sesuai backend.
- **PRESENTATION:** route menampilkan data nyata yang tersedia atau presentasi statis aman untuk menjelaskan anatomy/state masa depan, tetapi tidak menawarkan mutation palsu. Semua kontrol belum tersedia disabled dan beralasan.
- **DISABLED:** capability sengaja tidak tersedia. Entry boleh terlihat untuk orientasi produk, tetapi tidak navigable sebagai aksi aktif dan tidak memiliki success path.

Nilai berlaku per capability, bukan otomatis per halaman. Satu route dapat punya read `REAL`, visual anatomy `PRESENTATION`, dan generation action `DISABLED`.

### 6.2 Metadata frontend

Metadata harus typed, exhaustively checked, dan menjadi satu sumber untuk navigasi, notice, action enablement, dan test matrix. Bentuk kontrak:

```ts
type CapabilityMode = 'REAL' | 'PRESENTATION' | 'DISABLED';

type CapabilityReasonCode =
  | 'AVAILABLE'
  | 'BACKEND_NOT_AVAILABLE'
  | 'PREREQUISITE_MISSING'
  | 'IMPORT_OUT_OF_SCOPE'
  | 'PROJECT_CONTEXT_REQUIRED'
  | 'CHAPTER_CONTEXT_REQUIRED'
  | 'PROJECT_NOT_FOUND'
  | 'CHAPTER_NOT_FOUND'
  | 'CHAPTER_NOT_IN_PROJECT'
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'FOUNDATION_NOT_LOCKED'
  | 'ACCEPTED_PROSE_REQUIRED'
  | 'VALIDATION_REQUIRED'
  | 'JOB_ACTIVE'
  | 'PREVIEW_DISABLED';

type FrontendCapability = Readonly<{
  key: string;
  mode: CapabilityMode;
  reasonCode: CapabilityReasonCode;
  primaryAction: Readonly<{
    label: string;
    enabled: boolean;
  }>;
}>;
```

Aturan:

- `enabled: true` hanya sah saat `mode === 'REAL'`, auth/ownership lolos, dan prerequisite server-derived lolos.
- `PRESENTATION` dan `DISABLED` selalu `enabled: false`.
- Metadata tidak menyimpan `actionsEnabled` generik dan scenario preview tidak boleh mengoverride capability.
- UI menerjemahkan `reasonCode` ke plain Indonesian melalui message catalog; kode tidak tampil ke pengguna.
- Tidak ada fallback `realData ?? fixture`.
- Tidak ada success state yang hanya dipicu timeout/client state.

## 7. IA kanonis dan route matrix

### 7.1 Global routes

| Route | Tujuan | Capability awal | Konteks |
|---|---|---|---|
| `/` | Landing dan trust | REAL static | Global publik |
| `/masuk` | Masuk email+password | REAL | Publik/auth |
| `/daftar` | Daftar email+password | REAL | Publik/auth |
| `/lupa-password` | Minta reset | REAL | Publik/auth |
| `/reset-password/konfirmasi` | GET token → pending cookie → clean URL | REAL | Publik/auth |
| `/reset-password/baru` | Simpan password baru | REAL | Publik/auth |
| `/verifikasi/konfirmasi` | GET token → pending cookie → clean URL | REAL | Publik/auth |
| `/verifikasi/selesaikan` | POST verifikasi dan masuk | REAL | Publik/auth |
| `/privasi` | Kebijakan Privasi | REAL static; isi legal tetap mengikuti milestone | Global publik |
| `/ketentuan` | Ketentuan Layanan | REAL static; isi legal tetap mengikuti milestone | Global publik |
| `/app` | Dashboard semua proyek | REAL | Global authenticated |
| `/app/proyek/baru` | Buat proyek; jalur `no_idea`, `rough_idea`, `has_outline`, `fix_story` real; `has_draft` disabled | REAL/DISABLED | Global authenticated |
| `/app/proyek/impor` | Intent impor draft | DISABLED; tidak ada upload, analisis, persistence, atau success path | Global authenticated |
| `/app/kredit` | Ringkasan kredit lintas proyek | PRESENTATION sampai read model kredit tersedia | Global authenticated |
| `/app/pengaturan` | Profil, mode, tier, sesi, hapus akun | PRESENTATION kecuali aksi auth yang sudah tersedia eksplisit | Global authenticated |

`/app/proyek/impor` mempertahankan intent kanonis tetapi seluruh operasi disabled dengan reason `IMPORT_OUT_OF_SCOPE`. Kartu “Aku sudah punya draft” boleh menuju halaman penjelasan disabled ini; tidak boleh memulai file chooser atau mutation. Panduan Uji Coba dikecualikan dari produk.

### 7.2 Project routes

Base: `/app/proyek/[projectId]`.

| Suffix | Label | Peran | Capability awal |
|---|---|---|---|
| `` | Beranda Proyek | status, next action, ringkasan | REAL |
| `/chat` | Chat Narra | intake tersimpan; reply AI kemudian | REAL untuk persist user message; DISABLED untuk balasan AI sebelum M4 |
| `/konsep` | Pilih Konsep | 3 konsep dan accept ke foundation draft | PRESENTATION/DISABLED sebelum use case tersedia |
| `/fondasi` | Fondasi Cerita | draft, confirm, readiness, lock | REAL |
| `/karakter` | Karakter | daftar/detail user-origin | REAL read; create/edit/delete/proposal/knowledge controls DISABLED |
| `/outline` | Rencana Cerita | create roadmap → mini arc → bab | REAL create; edit/delete/reorder/beat/generation/write DISABLED |
| `/rahasia` | Jadwal Rahasia | sequence-based reveal timeline dan breadcrumb | REAL read; mutation DISABLED |
| `/fakta` | Fakta yang Dikunci | daftar lifecycle fakta | REAL read; mutation dan AI proposal workflow DISABLED |
| `/tulis` | Lanjut Menulis | resolver memilih resume target dari server-derived progress | PRESENTATION sampai chapter write siap; tidak memilih array pertama |
| `/naskah` | Naskah proyek | overview bab dan accepted prose | PRESENTATION sampai read model siap |
| `/publish` | Paket Publish proyek | overview status publish per bab | PRESENTATION sampai artifact read model siap |

`/tulis` adalah route resume, bukan editor bab tanpa identitas. Entry resolver memakai real active/resumable chapter signal bila production contract tersedia. Jika tidak ada target tunggal, user memilih chapter legal. Jika tidak ada chapter legal, tampilkan blocked state terstruktur. Jangan pilih chapter pertama.

### 7.3 Chapter routes

Semua chapter route wajib membawa `projectId + chapterId`:

- `/app/proyek/[projectId]/bab/[chapterId]/tulis`
- `/app/proyek/[projectId]/bab/[chapterId]/cek`
- `/app/proyek/[projectId]/bab/[chapterId]/selesaikan`
- `/app/proyek/[projectId]/bab/[chapterId]/naskah`
- `/app/proyek/[projectId]/bab/[chapterId]/publish`

Tidak ada beat route. Beat/adegan dipilih dalam konteks chapter melalui read model dan URL state yang tervalidasi jika kelak diperlukan; `beatId` tidak menjadi route root pada scope ini.

| Chapter route | Anatomy | Capability awal |
|---|---|---|
| `tulis` | chapter context, peta adegan, arahan, prose workspace, job/quote panel | PRESENTATION/DISABLED sampai M3–M5 binding lengkap |
| `cek` | accepted/working version context, validation phase/findings/stale state | PRESENTATION/DISABLED sampai validation use case tersedia |
| `selesaikan` | sanitized change review, confirmation, completed next step | PRESENTATION/DISABLED sampai atomic accept tersedia |
| `naskah` | accepted prose reader, version label, prev/next chapter | PRESENTATION sampai accepted prose read model tersedia |
| `publish` | artifact fields, mobile preview, checklist, copy/export | PRESENTATION/DISABLED sampai accepted prose dan publish artifact tersedia |

### 7.4 Resolver konteks

Ada dua semantics resolver yang berbeda.

**Explicit resource resolution** untuk URL kanonis:

1. autentikasi user aktif;
2. resolve `projectId` tenant-scoped dari URL;
3. untuk chapter route, resolve `chapterId` hanya setelah project lolos dan dalam project yang sama;
4. foreign, random, dan missing ID tetap branded `NOT_FOUND` secara eksternal;
5. route composition menerima ViewModel kecil, bukan raw repository records.

**Entry context resolution** untuk global/project entry action:

1. explicit ID jika entry URL sudah membawanya;
2. real active/resumable signal jika production contract tersedia;
3. jika beberapa resource legal tersedia tanpa satu target resmi, hasil `choose` meminta user memilih;
4. jika tidak ada resource legal, hasil `blocked` memakai structured reason dan next legal route.

```ts
type ProjectContextResult =
  | { kind: 'resolved'; projectId: string; href: string }
  | { kind: 'choose'; projects: ProjectChoiceView[] }
  | {
      kind: 'blocked';
      reasonCode: 'no_project' | 'no_eligible_project';
      createProjectHref: string;
    };

type ChapterBlockReason =
  | 'no_chapter'
  | 'foundation_not_locked'
  | 'no_writable_chapter'
  | 'chapter_unavailable';

type ChapterContextResult =
  | { kind: 'resolved'; projectId: string; chapterId: string; href: string }
  | { kind: 'choose'; chapters: ChapterChoiceView[] }
  | { kind: 'blocked'; reasonCode: ChapterBlockReason; outlineHref: string };
```

Explicit resource not-found tetap kontrak terpisah dari entry `blocked`; `NOT_AUTHORIZED` tidak membocorkan keberadaan resource. Structured reason berguna untuk mapper/test/log aman, bukan untuk membedakan foreign resource di browser.

Dilarang:

- `projects[0]`, `chapters[0]`, “bab aktif” hardcoded;
- project/chapter dari `localStorage`;
- fallback fixture;
- chapter query tanpa `projectId` ownership scope;
- client resolver sebagai authority.

## 8. Shell dan navigasi

### 8.1 Global shell vs project shell

**Global shell** dipakai `/app`, `/app/proyek/baru`, `/app/kredit`, `/app/pengaturan`. Isi: logo/dashboard, kredit/tier sesuai capability, akun/keluar, global navigation. Tidak menampilkan project sidebar seolah project terpilih.

**Project shell** dipakai seluruh `/app/proyek/[projectId]/**`. Isi: header global, project identity/context, project navigation, active route, status/next action server-derived. Pergantian project harus eksplisit; tidak mengubah URL diam-diam.

### 8.2 Desktop enam grup

1. **PERSIAPAN:** Beranda, Chat Narra, Fondasi, Karakter.
2. **PERENCANAAN:** Rencana Cerita, Jadwal Rahasia, Fakta.
3. **PENULISAN:** Naskah, Tulis.
4. **PEMERIKSAAN:** Cek Cerita.
5. **PUBLIKASI:** Paket Publish.
6. **LAINNYA:** Kredit & Penggunaan, Pengaturan.

Konsep bersifat transien setelah intake dan bukan item sidebar permanen. Selesaikan Bab adalah CTA kontekstual pada flow bab, bukan global navigation. Project navigation membangun href dari resolved `projectId`. Chapter-specific item memakai resolved/resume chapter target atau disabled reason; tidak mengarang `chapterId`.

### 8.3 Mobile lima tab

- **Beranda:** project home atau dashboard saat global.
- **Rencana:** project outline.
- **Tulis:** `/tulis` resume.
- **Cek:** chapter cek bila context valid; jika belum, reason-state tanpa fake destination.
- **Lainnya:** sheet berisi Persiapan lain, Jadwal Rahasia, Fakta, Naskah, Publish, Kredit, Pengaturan, dan Keluar.

Bottom nav hanya pada authenticated app. Tab active memakai route semantics, bukan state client terpisah. Minimum tap target 44×44 px.

## 9. Page anatomy dan kosakata

### 9.1 Anatomy umum

Urutan halaman produktif:

1. breadcrumb/context kembali;
2. title dan satu kalimat kondisi sekarang;
3. capability/status notice bila bukan REAL;
4. satu primary action server-derived;
5. konten utama;
6. detail sekunder/progressive disclosure;
7. feedback mutation/job dekat sumber aksi;
8. langkah berikutnya.

Empty state selalu menjawab: apa yang belum ada, mengapa, dan tindakan yang benar-benar tersedia. Loading menjaga struktur lewat skeleton. Error tidak menampilkan internal code/detail. Permission/foreign resource menjadi branded not-found. Disabled control tetap menjelaskan sebab lewat teks yang dapat dibaca tanpa hover.

### 9.2 Kosakata Indonesia plain-language

| Internal | UI wajib |
|---|---|
| Foundation / Story Bible | Fondasi Cerita |
| Canon | Cerita resmi / Fakta yang Dikunci, sesuai konteks |
| Canonical fact | Fakta yang Dikunci |
| Roadmap/Arc/Chapter/Beat | Roadmap Cerita / Bagian Cerita / Bab / Adegan |
| Reveal schedule | Jadwal Rahasia |
| Context packet | Bahan Aman untuk AI |
| Validation | Cek Cerita |
| Proposal | Usulan Narra / Usulan perubahan |
| ProseVersion | Versi Tulisan |
| Publish artifact | Paket Publish |
| GenerationJob | Sedang diproses |
| Credit reservation | Kredit ditahan |

Jangan tampilkan `canon vN`, raw `entityType`, `factKey`, `visibility`, UUID/ID, `revision`, `chapterId`, `sequence`, role mentah, message code, model ID, prompt, atau `service_restricted` sebagai copy utama. Mode Mahir boleh melihat detail author-private yang sudah dimapper, bukan internal storage labels.

## 10. Model state orthogonal

Frontend tidak membuat state machine kedua. State berasal dari axis independen dan mapper deterministik. Nilai berikut exhaustive dan terkunci; penambahan, rename, atau penggabungan memerlukan perubahan spec yang disetujui dan exhaustive test harus menolak nilai asing.

| Axis | Nilai yang diizinkan | Authority |
|---|---|---|
| `capability` | REAL, PRESENTATION, DISABLED | metadata frontend + server prerequisite |
| `view` | loading, ready, empty, error, stale | route/read lifecycle |
| `mutation` | idle, saving, saved, blocked, error | Server Action result |
| `quote` | unavailable, quoted, expired | server quote response; confirmation adalah action, bukan status quote |
| `job` | none, queued, running, succeeded, failed, dead, cancelled | `GenerationJob`/public phase |
| `artifact` | none, candidate, accepted | domain read model |
| `draft` | clean, saving, saved, conflict, stale | `ProseWorkingDraft`/CAS result |
| `validation` | not-run, running, ready, stale | `ValidationReport` + hash |
| `presentation` | editor, comparison, preview | route/server presentation mode |

`recoverable` adalah property pada error/job/mutation result, bukan status terminal baru. Bentuk minimal: `{ recoverable: boolean; retryKind?: 'same-read' | 'new-job' | 'request-new-quote' | 'manual-resolution' }`.

Pemisahan wajib:

- quote = estimasi server-frozen dan belum menahan kredit;
- reservation = kredit ditahan setelah konfirmasi;
- job = eksekusi async;
- ledger = catatan finansial append-only;
- artifact = hasil yang dapat dipakai;
- “Kreditmu tidak dipotong” hanya tampil jika hasil server membuktikan zero-charge, bukan asumsi saat error client.

UI mengomposisikan axis. Contoh: `capability=REAL`, `view=ready`, `job=running`, `draft=clean`, `validation=not-run`. Jangan membuat enum gabungan seperti `WRITE_PAGE_GENERATING_WITH_CREDIT_AND_NO_DRAFT`.

## 11. Design system architecture

### 11.1 Foundation palette dan semantic tokens

Foundation palette mengikuti `docs/design.md`: `brand-*`, `ink-*`, `line-*`, `surface`, `canvas`, `surface-soft`, `success-*`, `warning-*`, `danger-*`, `info-*`, `amber-500`, `plum-600`. Komponen tidak memakai raw `pink-*`, `gray-*`, atau hex baru.

Kategori token:

- color foundation;
- semantic color: background, surface, text, border, interactive, status, focus;
- typography: UI Plus Jakarta Sans variable 400–800, editorial/prose Lora;
- spacing 4/8-based;
- size/container/prose measure;
- radius;
- elevation;
- motion duration/easing;
- breakpoint;
- z-index layer;
- focus ring;
- disabled/opacity.

Semantic examples: `bg-canvas`, `bg-surface`, `bg-brand-soft`, `text-primary`, `text-secondary`, `border-default`, `border-active`, `action-primary`, `status-success`, `status-warning`, `status-danger`. Foundation palette tidak dipakai langsung oleh domain presentation kecuali token definition.

### 11.2 Layer dan dependency direction

```text
foundation tokens
  → primitives
    → composites
      → domain presentation
        → route composition
```

- **Primitives:** Button, IconButton, LinkButton, Input, Textarea, Select, Checkbox, RadioGroup, Field, Badge, Chip, Progress, Divider, Card, Surface, Stack, Cluster, Container, VisuallyHidden.
- **Composites:** BrandMark, PublicHeader, AppHeader, ProjectSidebar, MobileBottomNav, MobileDrawer, PageHeader, GuidancePanel, StatusBanner, EmptyState, ErrorState, LoadingSkeleton, ConfirmationDialog, BottomSheet, Tabs, StatCard, ActivityList, StickyActionBar, PreviewGateBanner, DisabledAction.
- **Domain presentation:** ProjectCard, ProjectProgress, StorySignalPanel, FoundationReadiness, FoundationSection, CharacterCard, FactCard, SecretScheduleCard, OutlineChapterCard, ChapterContextHeader, WritingGuidance, GenerationStatus, CandidateComparison, StoryCheckFinding, ChapterCompletionReview, ManuscriptReader, PublishPackageCard, CreditUsageSummary.
- **Route composition:** RSC route menerima ViewModel dan menyusun komponen; tidak menjadi design-system layer.

Dependency hanya turun sesuai panah. Primitive tidak mengimpor domain/application. Domain presentation tidak memanggil DB/use case. Route composition boleh mengimpor resolver/mapper adapter dan presentation components.

### 11.3 Server/client boundary

- Server Component default untuk route, shell, navigation, resolver, reads, capability/prerequisite mapping, dan static presentation.
- Client boundary kecil hanya untuk form pending state, dialog/sheet disclosure, tabs yang butuh interaksi lokal, autosize input, dan polling/job controls yang memang tersedia.
- Jangan menjadikan shell/page `'use client'` untuk convenience.
- ViewModel kecil, serializable, least-data; tidak mengirim raw row/payload atau service internals.

### 11.4 Badge vs Chip, progress, dialog/sheet

- **Badge:** status non-interaktif, contoh “Terkunci”, “Perlu ditinjau”, “Segera hadir”.
- **Chip:** pilihan/filter interaktif singkat, memiliki selected/focus/pressed semantics. Kalimat panjang bukan Chip.
- Progress bar hanya untuk metrik bermakna. Kesiapan Fondasi memakai hasil deterministik `readiness-policy`: persen + checklist + rekomendasi. Job phase tidak memakai persen palsu.
- Dialog desktop dan sheet/full-screen mobile wajib: semantic title/description, initial focus aman, focus trap, Escape bila aman, restore focus, close button berlabel, destructive/lock confirmation eksplisit. Dialog high-risk tidak auto-submit. Sheet tidak menutup primary content tanpa jalur kembali.

## 12. Preview gate fail closed

Preview gallery berguna untuk menilai state masa depan, tetapi hanya mode dev dan tidak boleh memengaruhi production route.

Urutan server-only wajib:

1. import `server-only` pada gate, scenario registry, dan mapper;
2. autentikasi user aktif;
3. bila scenario berhubungan dengan project/chapter, resolve ownership melalui `ProjectContextResolver`, lalu `ChapterContextResolver` bila perlu;
4. evaluasi environment dan allowlist gate;
5. pilih scenario statis typed, tenant-free;
6. mapper scenario menjadi ViewModel presentation-only;
7. render komponen yang sama dengan route, seluruh mutation/generation disabled.

Aturan gate:

- fail closed untuk production, env tidak dikenal, auth gagal, ownership gagal, atau scenario key tidak dikenal;
- tidak ada `NEXT_PUBLIC_*` fixture switch;
- tidak ada cookie/query client yang mengaktifkan preview tanpa validasi server;
- tidak ada `realData ?? fixture`;
- scenario tidak memuat tenant ID, email, naskah user, token, quote, reservation, ledger, job ID, atau `actionsEnabled`;
- scenario static dan typed; tidak melakukan write;
- komponen tetap membaca capability metadata, bukan scenario untuk enable action;
- galeri memakai internal route `/app/__preview/frontend-parity`; route wajib `notFound()` di production atau saat gate server tidak lolos, dan tidak masuk IA, navigation, atau sitemap production.

## 13. Kontrak interaksi route

### 13.1 5A — Public, auth, dan shell

**Landing `/`**

- Pertahankan exact hero, CTA `/daftar`, anchor `#cara-kerja`, legal links, enam langkah `Ngobrol/Fondasi/Rencana/Tulis/Cek/Publish`, dan source assertions `m0-w05`.
- Tambah parity section dari landing DC: masalah, capability/value, entry paths, kredit tanpa kejutan, trust/FAQ privasi. Jangan menawarkan import.
- Loading tidak diperlukan untuk static body. Error asset tidak menghalangi copy/CTA. Mobile nav tidak menyembunyikan akses Masuk.

**Auth**

- DC auth lama hanya mengontrol visual composition. Behavior mengikuti D21: daftar email+password, login email+password, verifikasi/reset two-step, anti-enumeration, lockout, revoke sessions.
- Pertahankan accessible labels dan E2E selectors: `Alamat email`, `Kata sandi`, `Ulangi kata sandi`, `Buat akun`, `Verifikasi & masuk`, `Masuk`, `Lupa kata sandi?`, `Kata sandi baru`, `Ulangi kata sandi baru`, `Simpan kata sandi baru`.
- Pending menonaktifkan duplicate submit. Error dekat form, generic jika credential/reset. Success hanya dari Server Action/redirect nyata.
- User authenticated pada `/masuk` atau `/daftar` tetap redirect `/app`.

**Legal/not-found/error**

- Pertahankan `APP_MESSAGES_ID.legal.status`, branded `BrandMark`, `reset()` pada error boundary, tanpa `error.message/stack/digest` ke UI.
- Foreign tenant dan random ID identik sebagai branded not-found.

**Authenticated shell**

- Pertahankan satu `getCurrentUser()` guard dan `redirect('/masuk')` yang dikunci source assertion.
- Evolusi disabled six-group shell menjadi global/project shell bertahap; compatibility test tetap memastikan enam group labels dan item inti.
- Keluar tetap aksi nyata. Kredit/tier hanya tampil sebagai angka/status real jika read model tersedia; sebelum itu gunakan capability notice, bukan angka fixture.

**Dashboard `/app`**

- Data proyek hanya dari `listMyProjects()`. Proyek intake/setup wajib tampil.
- Capability REAL terbatas pada project list, create CTA, dan field yang memang tersedia dari read model dashboard.
- Empty state CTA `/app/proyek/baru`; loading skeleton dan query error treatment tidak boleh mengarang data.
- Search, activity, readiness, target chapter, recent timestamp, next-writing CTA, dan stage experience tidak masuk production acceptance PR2. Search-miss dari DC hanya reference/future presentation state.
- Jangan membuat fabricated progress. `ProjectProgressView` dipakai pada Project Home, bukan untuk menghidupkan capability Dashboard.
- Pertahankan href `/app/proyek/baru`, heading level 1, dan project href nyata.

**Buat proyek `/app/proyek/baru`**

- Empat jalur REAL: `no_idea`, `rough_idea`, `has_outline`, `fix_story`; `has_draft` terlihat tetapi disabled.
- Pertahankan form names `title`, `jalur`, role button `/Buat proyek/i`, dan redirect ke project ID hasil Server Action.
- Pending “Membuat…”, error `role="alert"`, no optimistic project card.

### 13.2 5B — Semua route REAL M2

**Beranda Proyek `/app/proyek/[projectId]`**

- Pertahankan route authorization dan behavior `getMyProject`/`notFound` existing pada PR2; resolver architecture baru masuk PR3.
- Tampilkan title, next action, blockers, counts dari `getProjectProgress`; internal `nextAction.code`, `canon vN`, dan raw intake path dipetakan ke copy pengguna.
- Link M2 tetap menuju `chat`, `fondasi`, `outline`, `karakter`, `fakta`, `rahasia` dengan `projectId` yang sama.

**Chat `/chat`**

- Persist pesan user tetap REAL melalui `appendIntakeMessageAction` dan hidden `projectId`.
- Pertahankan selector `textarea[name="content"]`, tombol `/Kirim/i`, dan pesan yang selesai disimpan tampil setelah result nyata.
- AI reply sebelum M4 DISABLED dengan alasan; copy “menyusul di M4” developer-facing diganti plain Indonesian.
- Empty, submitting, persisted, validation error, tenant not-found. Jangan simulasikan typing Narra atau reply.

**Fondasi `/fondasi`**

- Reads tetap `getProjectFoundation`; mutation tetap `updateFoundationDraftAction`, `confirmFoundationAction`, `lockFoundationAction`.
- Pertahankan hidden `projectId`, `expectedRevision`, field names existing, `textarea[name="coreConcept"]`, `/Simpan draft/i`, checkbox `acknowledged`, dan confirm/lock lifecycle.
- Readiness berasal dari domain policy; jangan hardcode 82/100. Locked state read-only dan perubahan masa depan hanya dijelaskan, tidak disimulasikan.
- Hilangkan internal copy/field exposure dari UI: ID tokoh, `chapterId`, sequence, truth/reveal jargon diganti picker/ViewModel pengguna tanpa mengubah payload contract.
- Mutation conflict/revision stale menjadi state recoverable manual resolution, bukan overwrite.
- Mapper wajib membuktikan payload dapat direpresentasikan losslessly sebelum Save aktif. Jika form tidak dapat merepresentasikan collection canonical lengkap, section terkait read-only dan Save seluruh payload disabled bila write berisiko menghapus data.
- Copy wajib untuk projection tidak lengkap: “Sebagian detail hanya bisa dilihat saat ini. Data ceritamu tetap tersimpan, tetapi belum semuanya dapat diedit dari halaman ini.”
- Dilarang memproyeksikan collection dengan `slice`, submit subset, lalu mengganti collection canonical.

**Rencana Cerita `/outline`**

- Reads tetap `getProjectOutline`; create roadmap/arc/chapter tetap action M2.
- Pertahankan names `projectId`, `title`, `parentId`, `ordinal`, buttons `Tambah roadmap`, `Tambah arc`, `Tambah bab` selama migration selector compatibility.
- Current Outline tetap create-only. Jangan menambah edit path, partial replacement, atau normalizer baru demi parity. Jika mutation REAL masa depan round-trip aggregate existing, projection-loss protection baru wajib diterapkan pada mutation tersebut.
- Guard `outline-downstream` tetap authority. Edit/delete/reorder/beat/generation/write tetap DISABLED; tampilkan alasan plain Indonesian tanpa membuat proposal flow palsu.
- Empty hierarchy memberi aksi dependency benar: roadmap dulu, lalu bagian, lalu bab.

**Karakter `/karakter`**

- Read tenant nyata tetap REAL. Jangan akses `getUnitOfWork` langsung dari route bila resolver/query adapter dapat menyediakannya; refactor boundary tidak boleh mengubah hasil.
- Wajib tampilkan `displayName` dan `role`. Relasi, panggilan, atau gaya bicara hanya opsional bila defensive parsing membuktikan read model/payload aman benar-benar menyediakan field tersebut; bukan acceptance PR2. Raw ID tidak tampil.
- Create/edit/delete/proposal/knowledge controls DISABLED. Jangan menambah modal dengan fake success.

**Fakta `/fakta`**

- Read tenant nyata dan lifecycle `fact-lifecycle` tetap REAL.
- `factKey`, enum `canonStatus`, dan `visibility` dipetakan ke label pengguna. `service_restricted` tidak masuk ViewModel.
- Mutation dan AI proposal workflow DISABLED. High-risk proposal action baru dapat aktif setelah use case dan konfirmasi server-authoritative tersedia.

**Jadwal Rahasia `/rahasia`**

- Read tenant nyata tetap REAL. Truth author-private hanya kepada owner; writer-safe panel tidak menerima truth.
- Raw `factId`, `revealId`, dan sequence tidak tampil. Visual timeline menerjemahkan breadcrumb, zona tertahan, target bab melalui ViewModel.
- Truth Inspector tetap DISABLED pada M2. Jika capability masa depan tersedia, author-private inspector hanya boleh aktif setelah server gating; tidak pernah melalui client-only mode gate.

**Proteksi lintas M2**

- Semua route memanggil auth lalu tenant scope; foreign/random branded not-found.
- Mutation hidden field tampering tetap ditolak dan tidak mengubah owner data.
- Projection-loss test wajib untuk setiap mutation REAL yang round-trip existing aggregate payload. Pada scope sekarang ini wajib untuk Foundation. Outline tetap create-only; jangan menambah edit/replacement normalizer hanya demi test.
- Existing selectors boleh diberi alias/transisi, bukan dihapus sebelum E2E diperbarui dan lulus pada PR yang sama.

### 13.3 5C — Future shells

**Pilih Konsep `/konsep`**

- Presentation: anatomy tiga kartu, loading tanpa persen, failure zero-charge copy hanya sebagai labelled scenario preview.
- Production action “Buatkan 3 konsep cerita”, retry, accept, variation, merge semuanya disabled sampai quote/job/concept use cases nyata.
- Accept kelak menghasilkan foundation draft, bukan locked foundation.

**Project `/tulis`**

- Entry context resolver memakai target active/resumable server-authoritative bila tersedia.
- Jika tidak ada target tunggal tetapi ada chapter legal, tampilkan pilihan chapter. Jika tidak ada chapter legal, tampilkan blocked reason dan link ke langkah nyata.
- Tidak memilih chapter pertama, fixture chapter, atau `localStorage` chapter.

**Chapter `/tulis`**

- Anatomy: chapter header, peta adegan, arahan adegan, prose workspace, bahan aman, quote, job phase, candidates, compare, draft/autosave/conflict.
- Semua future generation/edit/accept actions disabled sampai masing-masing capability REAL. State scenario hanya di preview gate.
- Quote, job, draft, validation, artifact ditampilkan terpisah sesuai axis.

**Project `/naskah` dan chapter `/naskah`**

- Project overview menunjukkan chapter dan availability accepted prose dari read model; tidak membuat placeholder seolah naskah ada.
- Chapter reader hanya menampilkan accepted prose nyata. Jika belum ada, empty `ACCEPTED_PROSE_REQUIRED` dengan tindakan kembali ke tulis.
- Prev/next memakai ordered project-owned chapter resolver, bukan array fixture.

**Project `/publish` dan chapter `/publish`**

- Project overview merangkum eligible chapter; chapter route memerlukan accepted prose.
- Form title/teaser/caption/comment bait/tags, preview HP, checklist mengikuti DC.
- Generate, regenerate, copy/export hanya aktif sesuai artifact capability nyata. Browser copy konten existing boleh REAL kelak; tidak boleh mengklaim artifact tersimpan.
- Label “tidak mengubah cerita resmi” selalu ada ketika artifact tersedia.

**Chapter `/cek`**

- Presentation anatomy: running, findings, clean, stale, repair.
- Blocking finding tidak punya ignore. “Abaikan dengan alasan” hanya dari server allowlist.
- Safe Repair disabled sampai quote/job/repair tersedia; hasil tidak auto-accept.

**Chapter `/selesaikan`**

- Presentation anatomy: review sanitized changes dan completed next step.
- “Terapkan & jadikan resmi” disabled sampai eligibility, CAS, atomic accept, and high-risk handling tersedia.
- Tidak menampilkan raw operation/internal rationale. Tidak bump canon dari frontend.

**Global kredit/pengaturan**

- Kredit presentation memisahkan tersedia, ditahan, rekonsiliasi; tidak memakai angka scenario pada production route.
- Header dan halaman kelak memakai `CreditSummaryView` yang sama.
- Pengaturan bersifat MIXED. Email/profile yang memang tersedia boleh REAL read-only; logout current session tetap REAL.
- Mode Pemula/Mahir, tier, logout semua device, delete account, export, writing preferences, dan mutation setting lain tetap PRESENTATION/DISABLED sampai Server Action dan contract nyata tersedia.
- Mode Mahir kelak gate data server-side. Hapus akun/proyek membutuhkan kontrak domain dan dialog destructive sebelum aktif.

## 14. Empty, loading, error, permission, dan edge states

| State | Kontrak |
|---|---|
| Empty | Membedakan belum ada data, filter tanpa hasil, prerequisite belum terpenuhi, dan capability disabled. Satu next action yang benar-benar tersedia. |
| Loading | Skeleton sesuai anatomy; tidak mengganti page title/context; `aria-busy` bila relevan; tidak menampilkan fake progress. |
| Read error | Pesan publik + retry bila `recoverable`; tidak menghapus data tersimpan; tidak bocor detail. |
| Mutation error | Dekat form, mempertahankan input aman, no success toast, duplicate submit dicegah. |
| Permission | Unauthenticated redirect login; inactive account ditolak sesuai auth; foreign/missing project/chapter branded not-found identik. |
| Capability disabled | Kontrol disabled, reason text terlihat, tidak ada href palsu atau click handler no-op. |
| Stale data | Re-fetch/reconfirm; quote expired meminta quote baru; validation stale meminta cek ulang; draft conflict meminta resolusi. |
| Active job | Recovery dari server; `JOB_ALREADY_ACTIVE` memakai `activeJobId`; tidak membuat job kedua. |
| Cancel | Queued vs running copy berbeda; state server authority; tidak menjanjikan refund sebelum settlement result. |
| No usable artifact | Zero-charge copy hanya setelah server membuktikan release penuh. |
| Deleted/tombstoned | Resource tidak dipresentasikan; late job tidak mempublikasikan proposal. |
| Long content | Text wraps; prose measure tetap; no horizontal page overflow; sheet scroll internal aman. |
| Reduced motion | Informasi tetap lengkap tanpa animasi. |

## 15. Privasi, keamanan, dan tenant behavior

- Data classes: `public`, `author_private`, `service_restricted`, `security`, `financial`.
- Browser hanya menerima field yang diperlukan. `service_restricted` dan `security` tidak boleh ada pada DTO, RSC serialized props, client bundle, DOM, error, analytics, preview scenario, atau logs.
- Author-private truth hanya setelah auth + project ownership + mode/policy server-side. Writer-safe material tetap tanpa truth/restricted guard set/future outline terlarang.
- Semua project/chapter read dan mutation tenant-scoped. IDOR mengembalikan public `NOT_FOUND` tanpa membedakan foreign/missing.
- Hidden input bukan authorization. Server Action mengulang auth, ownership, prerequisite, revision/CAS.
- Preview tidak memakai data tenant, bahkan setelah ownership lolos; ownership gate hanya memastikan akses konteks bila gallery route scoped.
- Tidak ada `NEXT_PUBLIC` untuk secrets, fixture enablement, AI key, internal mode, atau data class.
- Analytics berada di luar PR1–PR4. Pekerjaan parity tidak menambah event, vendor, adapter, atau payload analytics.
- FAQ privasi menjelaskan akses cerita, no-training sesuai model policy, export, permanent deletion, dan data yang dikirim ke provider. Jangan mengklaim provider guarantee sebelum D14 gate selesai.
- CSP, cookie, session, rate limit, token flow, and password policy tetap di luar kontrol komponen visual.

## 16. Responsive contract

### 16.1 375 px

- Satu kolom, horizontal padding 16 px, no page-level horizontal scroll.
- Header ringkas; authenticated project memakai bottom nav lima tab.
- Primary action sticky hanya bila tidak menutup input/keyboard; safe-area inset diperhitungkan.
- Sidebar/panel menjadi accessible sheet/full-screen dialog.
- Cards/tables stack; compare candidates menjadi tabs/segmented view, bukan dua kolom sempit.
- Prose full width, minimum body 16 px, tap target ≥44 px.
- Long Indonesian labels wrap; disabled reason tetap terlihat.

### 16.2 768 px

- Tablet transition: main content satu kolom lebar atau dua kolom hanya jika masing-masing tetap ≥320 px.
- Project navigation drawer; side inspector/supplemental panel menjadi sheet.
- Bottom nav tetap dapat dipakai sampai desktop project sidebar tersedia berdasarkan content fit.
- Forms boleh dua kolom untuk field pendek; prose tetap single measure.

### 16.3 1280 px

- Desktop project shell: sidebar enam grup, top bar, main content, optional 300–360 px side panel.
- Productive content max 1200 px; foundation/outline 1120–1200 px; form focus 720 px; prose 680–760 px.
- Publish dua kolom; write keeps prose dominant over technical panels.

### 16.4 1440 px

- Max-width tetap; ruang tambahan menjadi gutters/context, bukan baris teks panjang.
- Sidebar dan optional inspector dapat sticky dengan independent safe scrolling.
- Grid dashboard dapat bertambah kolom tanpa memperbesar card secara kosong.
- Visual comparison dapat dua kolom dengan heading/status sejajar.

Semua breakpoint diuji pada zoom browser dan content expansion. `375/768/1280/1440` adalah acceptance viewports; CSS breakpoint boleh content-driven selama hasil memenuhi kontrak.

## 17. Analytics di luar scope

Kontrak event, vendor, adapter, correlation, dan analytics tests bukan bagian PR1–PR4. Future work harus melalui keputusan produk/privacy terpisah dan tidak boleh disisipkan dalam implementation plan frontend parity.

## 18. Testing dan CI

### 18.1 Test layers

- Unit: capability metadata exhaustiveness, reason mapping, ViewModel mappers, state-axis composition, responsive helper tanpa DOM bila ada.
- Integration: resolver auth/ownership, chapter-in-project, route read models, mutation guards, projection-loss, REAL capability prerequisites.
- Contract: DTO tidak membawa restricted fields; scenario registry tenant-free dan tanpa `actionsEnabled`; route metadata lengkap.
- Architecture: server-only preview/resolvers, dependency direction, no direct Prisma, no domain import from primitives.
- E2E: existing auth selectors, dashboard/project create, M2 read/mutation, IDOR, disabled future action no side effect, mobile nav, preview fail-closed.
- Visual/a11y: 375/768/1280/1440, keyboard, focus, dialog/sheet, reduced motion, WCAG 2.2 AA.
- Source assertions: exact M0 selectors/guards dan six-group labels tetap dipertahankan selama refactor.

### 18.2 Exact CI names

Delapan required check harus tetap bernama persis:

1. `Lint & Typecheck`
2. `Unit Tests`
3. `Integration Tests`
4. `Architecture Boundaries`
5. `Migration (empty + drift)`
6. `Security Smoke`
7. `Contract Tests`
8. `E2E (Playwright)`

Test tidak boleh dilemahkan: tidak ada `.skip`, `test.only`, pengurangan assertion IDOR, penggantian real auth dengan fixture, perluasan `passWithNoTests` untuk suite yang seharusnya berisi test, penghapusan client bundle scan, atau perubahan check name. Root lint baseline nested-worktree issue dicatat dan diperbaiki pada workstream tooling terpisah atau melalui konfigurasi scoped yang direview; PR parity tetap melaporkan hasil jujur.

### 18.3 Acceptance criteria

- [ ] Semua route pada IA matrix, termasuk intent disabled `/app/proyek/impor`, punya metadata capability typed dan test exhaustive.
- [ ] `/app/proyek/impor` hanya intent DISABLED; tidak ada functional import flow, Panduan Uji Coba, atau beat route.
- [ ] Chapter routes memakai `projectId + chapterId` persis pada lima suffix yang ditetapkan.
- [ ] `/tulis` memakai entry resolver `resolved | choose | blocked`; target hanya dari explicit ID atau signal server, dan tidak ada first-array/localStorage/fixture fallback.
- [ ] Global shell dan project shell berbeda secara semantik.
- [ ] Desktop memiliki enam grup; mobile memiliki lima tab sesuai label terkunci.
- [ ] Existing M2 selector dan auth/IDOR guard tetap lulus.
- [ ] Foreign dan random project/chapter menghasilkan branded not-found identik tanpa data leak.
- [ ] Foundation round-trip tidak menghapus field/payload yang tidak direpresentasikan; Outline tetap create-only tanpa edit/replacement path baru.
- [ ] REAL action menghasilkan success hanya dari Server Action/use case nyata.
- [ ] PRESENTATION/DISABLED action tidak melakukan mutation, job, reservation, ledger, atau artifact write.
- [ ] Quote, reservation, job, ledger, artifact, draft, validation, capability, view, mutation, dan presentation tidak digabung menjadi state machine client kedua.
- [ ] `recoverable` berupa property dan retry behavior eksplisit.
- [ ] Badge non-interaktif dan Chip interaktif dibedakan secara semantic/accessibility.
- [ ] Progress persen hanya muncul dari metrik domain bermakna; job tidak memakai persen palsu.
- [ ] Dialog/sheet lulus keyboard, focus trap, restore focus, accessible name, dan reduced motion.
- [ ] Preview gate fail closed, server-only, authenticated, ownership-aware, static typed, tenant-free, dan dev-only.
- [ ] Tidak ada `NEXT_PUBLIC` fixture switch, `realData ?? fixture`, atau `actionsEnabled` dalam scenario.
- [ ] ViewModel tidak memuat `service_restricted`, security details, internal rationale, raw IDs sebagai copy, atau data tenant berlebih.
- [ ] Layout lulus pada 375, 768, 1280, dan 1440 px tanpa overflow atau action tertutup.
- [ ] Semua delapan CI check mempertahankan exact name; test lama tidak dilemahkan.
- [ ] Root lint baseline tetap dilaporkan gagal sampai penyebab nested-worktree diselesaikan; tidak ada klaim baseline clean.

## 19. Topologi empat PR

PR boleh sequential atau stacked. Jika stacked, setiap PR hanya berisi delta scope-nya dan base branch menunjuk predecessor. Predecessor harus review-clean dan CI disposition terdokumentasi sebelum successor difinalkan; successor boleh mulai sebagai draft tetapi tidak final/merge-ready lebih dulu.

### PR1 — Frontend foundation, public, auth, dan app shell

**Scope:** semantic tokens, fonts, primitive/composite architecture, typed capability metadata, state-axis types, ViewModel conventions, Badge/Chip, accessible Dialog/Sheet, landing parity, auth visual parity tanpa perubahan semantics, global/project shell foundation, responsive shell, capability notice. Existing route behavior dan selectors tetap.

**Commit intent:**

1. `feat(web): establish semantic frontend foundations`
2. `feat(web): align public auth and app shells`
3. `feat(web): add capability and presentation contracts`
4. `test(web): enforce frontend foundation boundaries`

**Acceptance:**

- [ ] Token categories dan dependency direction teruji.
- [ ] Server Component default; client primitives kecil.
- [ ] Metadata melarang enabled action pada PRESENTATION/DISABLED.
- [ ] Landing/auth/app shell mencapai parity referensi pada scope PR1 tanpa mengubah auth semantics.
- [ ] Existing landing/auth/shell source assertions tetap lulus.

### PR2 — REAL M2 route parity

**Depends on:** PR1 review-clean.

**Scope:** dashboard, buat proyek, project home, chat, foundation, outline, karakter, fakta, rahasia; preserve existing reads, actions, route authorization, behavior, dan selectors; Foundation projection-loss protection. Ini presentation refactor untuk capability M2 yang sudah ada, bukan capability expansion. Resolver architecture baru bukan scope PR2.

**Commit intent:**

1. `feat(web): bring M2 routes to design parity`
2. `test(web): preserve M2 selectors ownership and projections`

**Acceptance:**

- [ ] Existing auth smoke, `m0-w05`, dan IDOR behavior lulus.
- [ ] Six-group desktop dan five-tab mobile shell dari PR1 tetap benar.
- [ ] M2 reads/mutations tetap REAL dan tenant-scoped; disabled operations tidak diaktifkan.
- [ ] Internal vocabulary hilang dari user-facing route tanpa mengubah payload domain.

### PR3 — Canonical future route shells dan resolvers

**Depends on:** PR2 review-clean.

**Scope:** server-only preview gate, authorized preview context, typed tenant-free scenarios, capability metadata integration, explicit-resource dan entry-context project/chapter resolvers, disabled intent `/app/proyek/impor`, project `/konsep`, credit shell, settings MIXED shell, serta generation/validation presentation components yang dibutuhkan route authoring PR4. Semua unavailable action disabled; tidak ada backend feature fabrication. Import route tidak memiliki upload, analisis, persistence, atau success path. Preview tetap tooling sekunder; canonical product routes menjadi bukti utama.

**Commit intent:**

1. `feat(web): add fail-closed preview infrastructure`
2. `feat(web): resolve project and chapter entry context`
3. `feat(web): add concept credit and settings shells`
4. `feat(web): add future presentation components`
5. `test(web): enforce disabled future capability semantics`

**Acceptance:**

- [ ] Preview gate/scenario infrastructure tersedia server-only, fail closed, tenant-free, dan tidak menggantikan canonical product route evidence.
- [ ] Explicit-resource dan entry-context resolvers menjaga owner scope serta `resolved | choose | blocked` semantics.
- [ ] Tidak ada beat route, Panduan Uji Coba route, atau operasi aktif pada `/app/proyek/impor`.
- [ ] Konsep, credit, settings MIXED, generation, dan validation components tidak menghasilkan fake success atau side effect.

### PR4 — Authoring, mobile completion, dan evidence

**Depends on:** PR3 review-clean.

**Scope:** canonical Writing Workspace, Cek Cerita, Selesaikan Bab, Naskah, dan Publish routes; deliberate mobile authoring compositions dari `narraza-mobile.dc.html`; mengonsumsi preview gate, scenarios, resolvers, dan presentation components dari PR3; all state visual coverage; responsive/a11y tests; final evidence matrix/screenshots. Tidak membangun preview infrastructure baru dan tidak menambah production capability.

**Commit intent:**

1. `feat(web): add canonical authoring route shells`
2. `feat(web): complete mobile authoring presentation parity`
3. `test(web): cover responsive parity and accessibility`
4. `docs(web): record frontend parity evidence`

**Acceptance:**

- [ ] Lima chapter routes memakai URL kanonis dan mengonsumsi resolver/scenario infrastructure PR3.
- [ ] Writing/Cek/Selesaikan/Naskah/Publish tidak melakukan mutation future palsu.
- [ ] 375/768/1280/1440 evidence tersedia, termasuk deliberate mobile authoring composition.
- [ ] Semua route/state memiliki klasifikasi referensi dan capability evidence.

## 20. Risiko dan asumsi

| Risiko/asumsi | Dampak | Mitigasi |
|---|---|---|
| Full coverage disalahartikan full function | Fake behavior dan scope M4–M6 bocor | Capability per aksi, disabled future mutation, acceptance side-effect tests |
| DC dianggap source domain | Route/state/persistence salah | Authority order dan route matrix terkunci |
| Refactor M2 menghilangkan payload Foundation | Data canonical hilang saat round-trip form | Small ViewModel + Foundation projection-loss integration fixtures; Outline tetap create-only |
| Resolver membocorkan tenant existence | IDOR | owner-scoped query, public branded not-found identik |
| Preview bocor ke production | Data/trust/security issue | `server-only`, fail closed, no `NEXT_PUBLIC`, tenant-free scenarios, Security Smoke |
| Banyak combined states membuat client SM kedua | Drift dari backend | Orthogonal axes + mapper, no combined enum |
| Disabled UI terasa seperti broken feature | Trust turun | Reason copy terlihat, next available action, no no-op click |
| Existing selector berubah karena polish | Regression E2E | Compatibility selectors and same-PR test migration |
| Root lint baseline mengaburkan hasil | False clean/false blame | Catat preflight; jangan mengklaim clean; tooling fix terpisah |
| Legal content masih milestone-dependent | Overclaim privasi | Bedakan static route availability dan final legal review |

Asumsi tidak menghalangi implementasi:

- Existing application/domain contracts tetap authoritative dan tidak diubah oleh pekerjaan visual.
- Galeri preview `/app/__preview/frontend-parity` dipakai hanya reviewer/developer terautentikasi di development dan fail closed di production.
- Analytics tetap di luar PR1–PR4 sampai ada keputusan produk/privacy terpisah.

## 21. Task dependency order

- [ ] Bekukan baseline facts, selector inventory, route inventory, dan DC classification dalam PR description/evidence.
- [ ] Bentuk foundation palette dan semantic token mapping tanpa hardcoded component colors baru.
- [ ] Bentuk primitives, composites, accessibility contracts, dan layer import rules.
- [ ] Bentuk capability metadata, reason catalog, orthogonal state types, dan exhaustive tests.
- [ ] Bentuk small ViewModel contracts dan safe mappers.
- [ ] Bentuk global/project shell, six-group desktop, five-tab mobile.
- [ ] Terapkan public/auth parity pada PR1 sambil mempertahankan selectors.
- [ ] Terapkan dashboard/new-project dan seluruh M2 parity pada PR2 tanpa resolver refactor atau capability expansion.
- [ ] Terapkan Foundation projection-loss tests; Outline tetap create-only.
- [ ] Pada PR3, bentuk explicit-resource dan entry-context project/chapter resolvers dengan `resolved | choose | blocked` semantics.
- [ ] Pada PR3, bentuk preview gate server-only, authorized preview context, static typed scenario registry, dan dev-only gallery.
- [ ] Pada PR3, tambah concept, credit, settings MIXED, generation, dan validation presentation shells/components.
- [ ] Pada PR4, tambah canonical Writing/Cek/Selesaikan/Naskah/Publish routes memakai infrastructure PR3.
- [ ] Tambah disabled reason states dan no-side-effect tests untuk future actions.
- [ ] Jalankan responsive/a11y/visual review pada 375/768/1280/1440.
- [ ] Jalankan delapan CI suites yang relevan; catat root lint baseline secara jujur.
- [ ] Lengkapi evidence matrix route × state × capability × reference classification × test.

## 22. Evidence wajib

Evidence implementasi memakai exact paths berikut:

- `docs/frontend/VISUAL-REFERENCE-INVENTORY.md` untuk mapping REFERENCE FOUND/ADAPTED/INTENTIONAL DEVIATION/NEW SYSTEM-ONLY COMPONENT;
- `docs/frontend/ROUTE-CAPABILITY-MATRIX.md` untuk route × primary action × REAL/PRESENTATION/DISABLED × reason;
- `docs/frontend/DESIGN-PARITY-REPORT.md` untuk hasil akhir parity dan deviation;
- `docs/review/frontend/**` untuk screenshot, test output, audit, dan bukti per PR/head SHA.

Minimum evidence:

- route inventory hasil aktual;
- capability metadata dump/test snapshot yang human-readable;
- screenshot 375, 768, 1280, 1440 untuk public, global shell, project shell, M2 representative, dan future shell representative;
- keyboard/focus/dialog/sheet audit;
- auth smoke, IDOR, projection-loss, no-side-effect, preview fail-closed test output;
- exact delapan CI names dan run links/status;
- baseline lint exception statement sampai tooling issue terselesaikan;
- reviewer approval per PR dan predecessor review-clean proof.

Evidence tidak boleh berisi naskah tenant nyata, email nyata, tokens, secrets, raw IDs, service-restricted data, atau production fixture switch.

## 23. Definition of Done

- [ ] Full frontend route coverage tersedia sesuai IA kanonis; bukan klaim full functional frontend.
- [ ] Authority order diterapkan; DC hanya mengontrol visual/composition/responsive intent.
- [ ] Primary checkout tidak berubah dan worktree/branch isolation terbukti.
- [ ] Semua visual reference diklasifikasikan dan intentional deviation dijelaskan.
- [ ] Capability REAL/PRESENTATION/DISABLED executable, tested, dan tidak ambigu per action.
- [ ] Tidak ada fake success, fake progress, fake credit, fake autosave, atau fixture fallback pada production route.
- [ ] Global/project/chapter route contract tepat; import tetap intent disabled di `/app/proyek/impor`, tanpa Panduan Uji Coba atau beat route.
- [ ] Desktop six-group IA dan mobile five-tab IA konsisten.
- [ ] `ProjectContextResolver` lalu `ChapterContextResolver` fail closed dan tenant-scoped.
- [ ] Plain Indonesian vocabulary menggantikan jargon/internal identifiers di UI.
- [ ] Orthogonal state axes dipakai tanpa state machine client kedua; recoverability property eksplisit.
- [ ] Design system memakai semantic tokens, RSC default, small client boundaries, dan dependency direction terkunci.
- [ ] Badge/Chip, meaningful progress, dialog/sheet accessibility memenuhi kontrak.
- [ ] Preview gate server-only, authenticated, ownership-aware, static typed, tenant-free, fail closed, dan dev-only.
- [ ] Semua kontrak 5A, 5B, 5C terpenuhi; selector/guard M2 dan projection-loss protection lulus.
- [ ] Privacy/data-class/tenant rules lulus contract, security smoke, dan IDOR tests.
- [ ] Responsive behavior lulus 375/768/1280/1440 dan WCAG 2.2 AA pada alur utama.
- [ ] Delapan exact CI check tetap ada; tests tidak dilemahkan.
- [ ] PR1–PR4 menjaga scope, dependency, acceptance, dan predecessor review-clean rule.
- [ ] Evidence lengkap, aman, dan dapat diaudit.
- [ ] Baseline preflight menyebut root lint gagal karena nested-worktree `ambiguous tsconfigRootDir`; tidak ada klaim clean baseline.
- [ ] Tidak ada penanda pekerjaan belum diputuskan, path produk arbitrer, kontradiksi, atau pernyataan bahwa frontend parity sudah diterapkan.
