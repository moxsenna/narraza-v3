# W1.2–W1.5 Domain Core — Design Specification

**Tanggal:** 22 Juli 2026  
**Status:** Disetujui untuk perencanaan implementasi  
**Scope:** kebijakan domain murni, context packets, validator deterministik, dan operation layers di `packages/core`.

## 1. Sumber kebenaran

Urutan konflik mengikuti implementation plan:

1. `docs/DECISIONS.md`
2. `docs/narraza-v3-prd-rilis-1.md`
3. `docs/verification-matrix.md`
4. `docs/narraza-v3-design-spec.md`
5. `docs/implementation-plan.md`, khususnya W1.2–W1.5

Spesifikasi ini mengunci detail yang belum ditentukan sumber di atas. Bila dokumen dengan prioritas lebih tinggi berubah, spesifikasi ini harus direvisi sebelum implementasi terkait diteruskan.

## 2. Tujuan dan batasan

### 2.1 Tujuan

- Membuat seluruh policy W1.2–W1.5 sebagai pure functions yang dapat diuji tanpa DB, HTTP, Next.js, React, atau AI provider.
- Memisahkan data writer-safe dari data restricted secara tipe dan runtime.
- Menjamin hash, fold, finding merge, dan operation ordering deterministik.
- Menolak state ambigu atau malformed secara fail-closed.
- Menyediakan kontrak stabil untuk M2–M5 tanpa membangun orchestration milestone tersebut lebih awal.

### 2.2 Di luar scope

- Prisma repository, transaction, dan persistence mapping aktual.
- AI prompt, provider adapter, model routing, atau parse-repair.
- Proposal acceptance dan canonical mutation.
- Validation orchestration terhadap working draft.
- UI, DTO client, dan message catalog final.
- Konfigurasi policy dinamis dari DB.

## 3. Arsitektur dan delivery

### 3.1 Pendekatan

Gunakan modul kebijakan kecil dengan tipe eksplisit. Hindari satu domain engine besar dan framework rule generik. Setiap unit memiliki input/output sempit, immutable, dan dapat diuji terpisah.

Struktur target:

```text
packages/core/src/
  narrative/
    position.ts
    reveal-policy.ts
    expression-policy.ts
    knowledge-policy.ts
    disclosure-policy.ts
  foundation/
    readiness-policy.ts
  dependency/
    canonical-json.ts
    dependency-manifest.ts
    stale-policy.ts
  prose/
    prose-policy.ts
    repair-policy.ts
  context/
    packet-types.ts
    packet-builders.ts
  validation/
    finding.ts
    structural-validator.ts
    restricted-matcher.ts
    merge-findings.ts
    public-finding.ts
  operations/
    suggestion.ts
    normalized.ts
    canonical.ts
    catalog.ts
    resolver.ts
    topo-sort.ts
    operations-hash.ts
```

Nama file boleh disesuaikan sedikit saat planning bila pattern repo menuntutnya, tetapi boundary modul dan kontrak publik tidak berubah.

### 3.2 Dependency boundary

- `packages/core` hanya boleh bergantung pada `@narraza/shared` dan Node standard library yang dibutuhkan untuk SHA-256.
- Tidak boleh mengimpor Prisma type. Core mendefinisikan domain types sendiri.
- Public API diekspor eksplisit melalui barrel. Internal brands, constructors, dan helper canonicalization tidak diekspor bila tidak diperlukan consumer.
- Semua collection output memakai `readonly`.
- Unsupported input, duplicate identity, unresolved reference, dependency cycle, dan restricted-data violation menghasilkan typed domain error; tidak ada silent correction.

### 3.3 Urutan delivery

Empat PR berurutan:

1. W1.2 `feat/m1-core-policies`
2. W1.3 `feat/m1-context-packets`
3. W1.4 `feat/m1-validator`
4. W1.5 `feat/m1-operation-layers`

Setiap PR berbasis PR sebelumnya setelah merge. Setiap policy memiliki test file khusus. Verification matrix diperbarui sebelum test invariant baru diimplementasikan.

## 4. W1.2 — core values and policies

### 4.1 Narrative position

```ts
interface NarrativePosition {
  chapterId: string;
  beatId?: string;
  sequence: number;
}
```

Aturan:

- `sequence` wajib safe integer non-negatif.
- Comparator mengurutkan `sequence`, lalu `chapterId`, lalu `beatId ?? ""` memakai perbandingan code-unit stabil, bukan locale collation.
- Dua posisi sama hanya bila ketiga komponen sama.
- Chronology policy memakai `sequence`, bukan nomor tampilan bab.

### 4.2 Reveal policy

Input hanya memuat target reveal, breadcrumbs, current position, safe directives, dan restricted representations yang sudah dipisahkan.

```ts
interface WriterRevealGuidance {
  status:
    | "before_breadcrumb"
    | "breadcrumb_due"
    | "hold"
    | "reveal_due"
    | "revealed";
  safeDirectives: readonly string[];
}

interface RestrictedRevealGuardSet {
  prohibitedExact: readonly string[];
  prohibitedAliases: readonly string[];
  sensitiveTerms: readonly string[];
  targetPosition: NarrativePosition;
}
```

Aturan:

- Writer guidance tidak memiliki field truth, alias restricted, prohibited phrase, atau restricted guard.
- Breadcrumb wajib memiliki ID unik dan posisi yang lebih awal dari target. Duplicate position dan breadcrumb pada/setelah target ditolak.
- Breadcrumb diurutkan memakai comparator `NarrativePosition`, lalu breadcrumb ID.
- Sebelum breadcrumb pertama: `before_breadcrumb`.
- Tepat pada next pending breadcrumb: `breadcrumb_due`; hanya directive breadcrumb itu yang ditambahkan.
- Setelah suatu breadcrumb lewat dan sebelum breadcrumb berikut/target: `hold`.
- Tepat pada target: `reveal_due`; setelah target: `revealed`. Target precedence selalu menang karena breadcrumb pada target invalid.
- Reveal tanpa breadcrumb memakai `hold` sebelum target.
- Raw truth dan representasi restricted hanya berada dalam `RestrictedRevealGuardSet`.
- Builder menyalin safe directives melalui allowlist, bukan object spread dari reveal aggregate.

### 4.3 Expression policy

```ts
type ExpressionPermission =
  | "may_state"
  | "behavior_only"
  | "must_conceal"
  | "unknown";
```

Precedence keputusan:

1. Karakter tidak mengetahui: `unknown`.
2. Karakter mengetahui tetapi disclosure atau reveal tidak mengizinkan: `must_conceal`.
3. Karakter mengetahui, disclosure/reveal mengizinkan, dan non-POV: `behavior_only`.
4. Karakter mengetahui, disclosure/reveal mengizinkan, dan POV: `may_state`.

Dengan demikian, larangan reveal/disclosure selalu menang atas role POV. `behavior_only` hanya menghasilkan directive aman, seperti perubahan tindakan, jeda, penghindaran, atau reaksi. Raw belief payload tidak pernah masuk output untuk non-POV. Test wajib mencakup non-POV yang mengetahui unrevealed fact.

### 4.4 Knowledge policy

```ts
type BeliefLevel =
  | "unknown"
  | "suspected"
  | "believed"
  | "known"
  | "disproven";

type BeliefDowngradeReason =
  | "new_evidence"
  | "source_discredited"
  | "memory_loss"
  | "deliberate_deception"
  | "canon_correction";
```

Urutan epistemik: `unknown < suspected < believed < known`. `disproven` adalah state alternatif, bukan nilai numerik di atas atau di bawah urutan tersebut.

Fold:

1. Validasi semua event dan target sequence.
2. Abaikan event dengan `effectiveSequence > targetSequence`.
3. Sort ascending berdasarkan `effectiveSequence`, `createdAt`, lalu `id`.
4. Terapkan event berurutan.
5. Transisi ke tingkat lebih lemah, menuju `disproven`, atau keluar dari `disproven` wajib membawa salah satu `BeliefDowngradeReason`.
6. Event invalid membuat seluruh fold gagal; event tidak dilewati diam-diam.

`createdAt` memakai canonical UTC RFC 3339 dengan suffix `Z` dan presisi tepat millisecond, misalnya `2026-07-22T09:10:11.123Z`, selaras `timestamptz(3)`. Input wajib parse dan round-trip ke bentuk identik. Comparator membandingkan epoch milliseconds hasil parser eksplisit, lalu `id`; tidak memakai locale parsing implisit. Disclosure fold memakai kontrak timestamp sama.

### 4.5 Disclosure policy

```ts
type ReaderFactStatus = "unknown" | "suspected" | "known" | "retracted";
```

Aturan:

- Event `disclose` membawa hasil `suspected | known`.
- Event `retract` wajib menunjuk disclosure aktif sebelumnya untuk fact sama.
- Retraction atas retraction ditolak.
- Retraction atas disclosure yang bukan state aktif ditolak.
- Disclosure baru setelah retraction sah dan menjadi state aktif baru.
- Fold order: `effectiveSequence`, `createdAt`, lalu `id`.
- Hasil menyimpan `sourceDisclosureId`; hasil `retracted` juga menyimpan `retractionId`.
- Reader knowledge tidak pernah diinferensikan dari substring prose.

### 4.6 Foundation readiness

Checklist dan bobot:

| Key | Unsur | Bobot |
|---|---|---:|
| `core_concept` | Konsep inti | 20 |
| `main_character` | Tokoh utama | 15 |
| `main_relationship` | Relasi utama | 10 |
| `conflict` | Konflik | 15 |
| `ending_direction` | Arah ending | 10 |
| `reader_promise` | Janji pembaca | 10 |
| `character_address` | Panggilan tokoh | 5 |
| `speech_style` | Gaya bicara | 5 |
| `secret_schedule` | Rahasia dan jadwal reveal | 10 |

Total 100. Core menerima snapshot typed, bukan boolean keputusan caller:

```ts
interface FoundationReadinessInput {
  coreConcept: string | null;
  mainCharacter: {
    id: string;
    active: boolean;
    identity: string | null;
    goal: string | null;
    motivation: string | null;
    address: string | null;
    speechStyle: string | null;
  } | null;
  relationships: readonly {
    fromCharacterId: string;
    toCharacterId: string;
    active: boolean;
    description: string | null;
  }[];
  conflict: string | null;
  endingDirection: string | null;
  readerPromise: string | null;
  secrets: readonly {
    truth: string | null;
    targetPosition: NarrativePosition | null;
    breadcrumbPositions: readonly NarrativePosition[];
  }[];
}
```

Presence string berarti trim menghasilkan minimal satu Unicode code point. Main character harus resolved dan aktif. Relationship terpenuhi bila ada relationship aktif yang menghubungkan main character dengan karakter lain dan description hadir. Address dan speech style diambil dari main character aktif. Secret schedule memilih minimal satu secret dengan truth hadir, target valid, dan breadcrumb valid yang semuanya mendahului target. Core menghitung seluruh predicate dari snapshot tersebut.

Partial scoring hanya berlaku pada unsur berikut:

- `main_character`: identitas 5, tujuan 5, motivasi 5.
- `secret_schedule`: truth 4, target reveal 3, minimal satu breadcrumb 3.

Unsur lain bernilai 0 atau bobot penuh.

```ts
interface ReadinessResult {
  percent: number;
  checklist: readonly ReadinessChecklistItem[];
  nextRecommendation: ReadinessKey | null;
}
```

- `percent` adalah integer hasil penjumlahan bobot, tanpa floating point.
- Checklist selalu mengikuti urutan tabel.
- Recommendation memilih item belum penuh dengan bobot tersisa terbesar.
- Tie-break recommendation memakai urutan tabel.
- Recommendation `null` saat 100%.

### 4.7 Canonical serialization

Canonical serializer dipakai dependency manifest, finding identity, repair fingerprint, dan operation hash.

Nilai yang diterima:

- `null`
- boolean
- string well-formed Unicode
- safe integer
- dense array
- plain object dengan own enumerable string keys

Nilai yang ditolak:

- `undefined`
- `Date`
- `bigint`
- symbol/function
- non-finite number atau non-integer number
- sparse array
- cyclic structure
- class instance/non-plain prototype
- lone UTF-16 surrogate

Aturan:

- Object keys diurutkan ascending memakai perbandingan code-unit deterministik.
- Array mempertahankan urutan.
- String dipertahankan byte-for-byte setelah validasi well-formed Unicode; serializer tidak melakukan Unicode normalization.
- Output JSON compact UTF-8.
- Hash memakai SHA-256 lowercase hexadecimal.

### 4.8 Dependency manifest

```ts
interface DependencyEntry {
  entityType: string;
  entityId: string;
  revision: number;
  contentHash?: string;
  deleted: boolean;
}
```

Validasi:

- `entityType` dan `entityId` non-empty.
- `revision` safe integer non-negatif.
- `contentHash`, bila ada, harus lowercase SHA-256 hex.
- Duplicate `(entityType, entityId)` ditolak.

Canonical entry order: `entityType`, lalu `entityId`, memakai comparator stabil yang sama. Hash input:

```text
narraza-dependency-manifest:v1\n<canonical-json-array>
```

Global canonical version tidak masuk manifest.

### 4.9 Stale policy

Perbandingan memakai manifest proposal dan manifest current.

```ts
type DependencyStatus = "current" | "needs_revalidation" | "stale";

interface DependencyApplicability {
  targetExists: boolean;
  targetDeleted: boolean;
  targetIdentityUnchanged: boolean;
  expectedRevisionMatches: boolean;
  relevantDependencyKeys: readonly string[];
}
```

Policy menghitung changed dependency keys dari dua manifest; caller hanya menyatakan relevance dan target applicability yang didapat dari canonical operation snapshot.

Truth table fail-closed:

- Manifest identik: `current`, selama applicability metadata valid.
- Target hilang/deleted, identity berubah, atau expected revision mismatch: `stale`.
- Relevant dependency berubah sementara target dan revision tetap valid: `needs_revalidation`.
- Hanya dependency irrelevant berubah: `current`.
- Global canonical version berubah tanpa perubahan manifest: `current`.
- Duplicate/unknown relevant key atau metadata kontradiktif menghasilkan typed error, bukan `current`.

### 4.10 Prose policy

Pure decision functions menjaga:

- Accepted prose immutable.
- Working draft hanya berubah bila expected revision cocok.
- Accepted pointer harus menunjuk prose version pada beat sama.
- Perubahan content hash membuat validation binding tidak cocok.
- Policy menghasilkan typed decision/error; mutation dilakukan M2/M5.

### 4.11 Repair policy

Stop condition dipilih dengan prioritas:

1. `all_blocking_resolved`
2. `regression`
3. `same_findings_repeated`
4. `no_progress`
5. `attempt_limit`
6. `continue`

Definisi:

- Resolved: tidak ada blocker aktif.
- Regression: jumlah blocker naik atau aggregate severity score blocker memburuk.
- Repeat: canonical fingerprint set blocker identik dengan attempt sebelumnya.
- No progress: fingerprint berubah, tetapi jumlah blocker dan aggregate severity score tidak turun.
- Limit: jumlah attempt selesai mencapai `maxAttempts` positif.
- Fingerprint entry terdiri dari `ruleKey`, normalized location, dan `evidenceHash ?? null`; set diurutkan sebelum hashing.

## 5. W1.3 — context packets

### 5.1 Data classification

```ts
type DataClass =
  | "writer_safe"
  | "review_safe"
  | "author_private"
  | "service_restricted";
```

| Data class | Planner | Writer | Validator | Repair | Extraction |
|---|---:|---:|---:|---:|---:|
| `writer_safe` | Ya | Ya | Ya | Ya | Ya |
| `review_safe` | Ya | Tidak default | Ya | Hanya directive tersanitasi | Sesuai use case |
| `author_private` | Ya | Tidak | Ya | Tidak | Hanya restricted mode |
| `service_restricted` | Tidak | Tidak | Tidak | Tidak | Tidak |

`service_restricted` tidak masuk context packet mana pun.

### 5.2 Common metadata

```ts
interface PacketMetadata {
  schemaVersion: 1;
  projectId: string;
  dependencyHash: string;
  policyVersion: string;
}
```

Dependency hash wajib lowercase SHA-256. Schema version dan policy version harus dikenali builder.

### 5.3 Packet union

```ts
type ContextPacket =
  | PlannerContextPacket
  | WriterContextPacket
  | ValidatorContextPacket
  | RepairContextPacket
  | ExtractionContextPacket;
```

#### Planner

- `kind: "planner"`, `dataClass: "author_private"`.
- Memuat foundation, characters, facts, reveals, dan future outline yang dibutuhkan planning.
- `planner_only` facts diizinkan.
- Service secrets, credential, provider metadata sensitif, dan security config tetap dilarang.

#### Writer

- `kind: "writer"`, `dataClass: "writer_safe"`.
- Memuat beat contract aman, behavioral character directives, established writer-safe facts, writer reveal guidance, dan accepted prose context yang aman.
- Secara struktur tidak memiliki truth, raw beliefs, restricted aliases, restricted guard set, future outline, `planner_only` facts, unrevealed fact payload, atau author-private wrapper.

#### Validator

- `kind: "validator"`, `dataClass: "author_private"`.
- Memuat prose, validator beat contract, restricted guard sets, dan continuity rules.
- Tidak dapat dikonversi menjadi writer packet.
- Restricted details tidak ikut public mapper.

#### Repair

- `kind: "repair"`, `dataClass: "writer_safe"`.
- Memuat repairable prose, sanitized repair directives, writer-safe beat contract, dan writer reveal guidance.
- Tidak menerima internal validation finding utuh.
- Raw truth, forbidden phrase, restricted evidence, dan internal rationale dilarang.

#### Extraction

Extraction packet merupakan union dua mode:

- `review_safe` untuk `intake_signals` dan `prose_public_structure`.
- `author_private` untuk `canon_reconciliation`.

Tidak ada custom extraction use case. Mapping use case ke data class bersifat tetap.

### 5.4 Builders dan leak prevention

Public builders:

```ts
buildPlannerPacket(input)
buildWriterPacket(input)
buildValidatorPacket(input)
buildRepairPacket(input)
buildExtractionPacket(input)
```

- Tidak ada generic `buildPacket(kind, payload)`.
- Builder membuat object baru dari exact field allowlist.
- Unknown key pada runtime boundary ditolak.
- Duplicate entity IDs ditolak.
- Packet kind/data class mismatch ditolak.
- Internal unique-symbol brands membedakan restricted dan writer-safe projections.
- Brands melengkapi, bukan mengganti, runtime validation.

Test wajib:

- `writer-packet-leak`
- `writer-guidance-safe`
- compile-time non-assignability restricted types ke writer fields
- repair packet menolak unsanitized finding
- extraction use case menolak data class mismatch

## 6. W1.4 — deterministic validator

### 6.1 Finding model

```ts
type FindingSource = "deterministic" | "model";
type FindingSeverity = "info" | "warning" | "error" | "blocking";

interface InternalValidationFinding {
  findingKey: string;
  source: FindingSource;
  ruleKey: string;
  severity: FindingSeverity;
  publicMessageCode: string;
  location?: FindingLocation;
  evidenceHash?: string;
  restrictedDetail?: RestrictedFindingDetail;
}

interface PublicValidationFinding {
  findingKey: string;
  ruleKey: string;
  severity: FindingSeverity;
  publicMessageCode: string;
  location?: FindingLocation;
}
```

Persistence mapping untuk M5:

- `deterministic` dan `model` dipetakan ke DB source `validator`.
- Provenance rinci berada dalam typed payload.
- Kolom DB `message` menyimpan `publicMessageCode`, bukan raw internal message.
- `toPublicFinding` membangun object baru melalui allowlist; tidak memakai spread.

Severity rank: `info < warning < error < blocking`.

### 6.2 Finding identity

Identity material:

```text
ruleKey + normalized-location + evidenceHash-or-null
```

Material diserialisasi canonical dan di-hash SHA-256. Source dan severity tidak masuk identity. Deterministic dan model finding pada kejadian sama berkolisi dengan key sama; deterministic selalu menang.

### 6.3 Structural beat validation

Kontrak minimum:

```ts
interface BeatContract {
  beatId: string;
  purpose: string;
  requiredCharacterIds: readonly string[];
  requiredFactKeys: readonly string[];
  requiredDirectives: readonly BeatDirective[];
  prohibitedActions: readonly ProhibitedAction[];
  endingRequirement?: EndingRequirement;
  lengthRange?: { min: number; max: number };
}
```

Checks Rilis 1:

- prose kosong;
- karakter wajib tidak hadir;
- fakta aman wajib tidak direpresentasikan;
- directive beat wajib tidak terpenuhi;
- tindakan terlarang muncul;
- ending requirement tidak terpenuhi;
- panjang di luar range.

Check yang tidak bisa dibuktikan lexical menghasilkan semantic-review requirement, bukan blocker palsu.

### 6.4 Restricted matcher

Normalization khusus matching:

1. Validasi well-formed Unicode.
2. Unicode NFKC.
3. Locale-independent lowercase.
4. Punctuation dan whitespace sequence menjadi satu spasi.
5. Trim.
6. Tokenisasi berdasarkan Unicode letters/numbers.
7. Teks asli hanya dipakai menghitung lokasi internal; matched restricted text tidak masuk public finding.

Modes:

- Exact: normalized phrase utuh pada token boundary; `matched`; default `blocking`.
- Alias: sama seperti exact; `matched`; default `blocking`.
- Co-occurrence: seluruh term group muncul dalam satu kalimat; `suspected`; default `error`.
- Proximity: seluruh term muncul dalam jendela maksimum 20 token; `suspected`; default `error`.
- Semantic gap: guard sensitif tanpa lexical evidence cukup; `requires_semantic_review`; default `warning`.

```ts
type RestrictedMatchStatus =
  | "matched"
  | "suspected"
  | "requires_semantic_review";
```

Guard malformed ditolak: phrase kosong, alias kosong, duplicate normalized phrase, atau term group kurang dari dua term.

### 6.5 Merge findings

Aturan:

1. Validasi seluruh finding.
2. Duplicate deterministic `findingKey` ditolak sebagai policy bug.
3. Masukkan semua deterministic findings tanpa perubahan.
4. Model finding dengan key baru ditambahkan.
5. Collision model dengan deterministic mengabaikan versi model.
6. Collision antar-model mempertahankan severity tertinggi.
7. Tie severity antar-model memilih canonical serialized value terkecil.
8. Model tidak dapat menghapus, menurunkan, resolve, atau mengganti identity fields deterministic finding.
9. Sort output: severity descending, `ruleKey`, normalized location, lalu `findingKey`.
10. `passed` hanya true bila tidak ada severity `blocking`.
11. `requires_semantic_review` tidak otomatis menjadi blocker; hasil judge kemudian dapat menambah blocker.

### 6.6 Prompt-injection policy fixture

Prose diperlakukan sebagai data. Adversarial fixture mencakup instruksi seperti:

- abaikan aturan sebelumnya;
- hapus blocker deterministik;
- tandai pemeriksaan sebagai lolos;
- turunkan semua temuan menjadi info.

Assertions:

- deterministic blocker tetap ada dan tetap blocking;
- `passed` tetap false;
- prose tidak mengubah rule catalog/config/merge behavior;
- public output tidak membawa restricted detail.

Typed validator errors minimal:

- `INVALID_BEAT_CONTRACT`
- `INVALID_RESTRICTED_GUARD`
- `INVALID_FINDING`
- `DUPLICATE_DETERMINISTIC_FINDING`
- `UNSUPPORTED_POLICY_VERSION`

## 7. W1.5 — operation layers

### 7.1 Three type boundaries

```ts
interface ModelSuggestionDraft {
  schemaVersion: 1;
  tempRef: string;
  operationType: SuggestionOperationType;
  input: unknown;
  dependsOn?: readonly string[];
}
```

Model suggestion tidak memiliki `operationId`, final `targetId`, expected revision, risk, ordinal, atau hash. Runtime parser strict menolak unknown top-level keys, termasuk system-derived fields yang disisipkan model.

```ts
interface NormalizedOperationDraft {
  schemaVersion: 1;
  localRef: string;
  operationType: CanonicalOperationType;
  target:
    | { kind: "existing"; entityType: EntityType; entityId: string }
    | { kind: "temporary"; tempRef: string };
  payload: NormalizedOperationPayload;
  dependsOn: readonly string[];
}
```

Normalized draft memakai canonical field names dan validated payload, tetapi reference baru belum dialokasikan. Mapper eksplisit menangani alias model yang diizinkan; canonical validator tetap exact-key strict.

```ts
interface CanonicalChangeOperation {
  schemaVersion: 1;
  operationId: string;
  ordinal: number;
  operationType: CanonicalOperationType;
  targetEntityType: EntityType;
  targetId: string;
  expectedRevision: number | null;
  risk: "low" | "medium" | "high";
  payload: CanonicalOperationPayload;
}
```

Canonical type memakai internal brand dan hanya dibuat resolver domain.

### 7.2 Operation catalog Rilis 1

```ts
type CanonicalOperationType =
  | "foundation.update"
  | "character.create"
  | "character.update"
  | "fact.create"
  | "fact.update"
  | "state.append"
  | "belief.append"
  | "disclosure.append"
  | "reveal.create"
  | "reveal.update"
  | "breadcrumb.create"
  | "outline.create"
  | "outline.update"
  | "prose.version.create"
  | "prose.accept";
```

Catalog contract:

| Operation | Target/mode | Contracts | Risk | System-derived dan dependency utama |
|---|---|---|---|---|
| `foundation.update` | foundation existing | intake, foundation | medium | expected revision dari snapshot |
| `character.create` | character temporary | foundation | low | target ID dialokasikan; revision null |
| `character.update` | character existing | foundation | medium | expected revision wajib |
| `fact.create` | fact temporary | foundation, beat.write, repair | high | target ID dan factKey dialokasikan; prose source wajib evidence |
| `fact.update` | fact existing | foundation, beat.write, repair | high | expected revision wajib; prose source wajib evidence |
| `state.append` | character existing | beat.write, repair | medium | effective sequence dan prose evidence system-derived |
| `belief.append` | character existing | beat.write, repair | medium | effective sequence, belief key, dan prose evidence system-derived |
| `disclosure.append` | fact existing/temporary | beat.write, repair | high | effective sequence, retraction target, dan prose evidence system-derived |
| `reveal.create` | reveal temporary terhadap fact | foundation, outline | high | target ID/sequence; fact producer mendahului |
| `reveal.update` | reveal existing | foundation, outline | high | expected revision dan target sequence wajib |
| `breadcrumb.create` | breadcrumb temporary terhadap reveal | outline | medium | sequence; reveal producer mendahului |
| `outline.create` | roadmap/arc/chapter/beat temporary | outline | medium | parent ref, target ID, ordinal, narrative sequence |
| `outline.update` | roadmap/arc/chapter/beat existing | outline | medium | expected revision wajib |
| `prose.version.create` | prose version temporary | beat.write, repair | low | target ID, content hash, beat binding |
| `prose.accept` | beat existing | beat.write, repair | high | expected beat revision; resolved prose target |

Exact discriminated payload interfaces per row menjadi bagian implementation plan dan code catalog, tetapi aturan ini sudah tetap:

- Setiap payload memiliki closed key set; unknown nested key ditolak.
- Create operation mendeklarasikan `tempRef` lewat top-level suggestion dan memiliki `expectedRevision = null`.
- Update operation memakai existing domain ID dan expected revision dari snapshot; model tidak menentukan revision.
- Append operation tidak mengubah target revision, tetapi semua referenced existing entities harus resolved di snapshot.
- Temporary references hanya di field yang catalog tandai sebagai entity reference.
- `factKey`, narrative sequences, IDs, revisions, risk, ordinal, dan content hash dihitung/divalidasi sistem. Model tidak menentukan nilai final.

Prose-derived `fact.create`, `fact.update`, `state.append`, `belief.append`, dan `disclosure.append` wajib membawa normalized evidence input:

```ts
interface ProseEvidenceBinding {
  proseVersionRef: string;
  proseContentHash: string;
  startUtf16: number;
  endUtf16: number;
}
```

Evidence invariant:

- `0 <= startUtf16 <= endUtf16 <= prose.length` dalam UTF-16 code units;
- content hash cocok prose version target;
- evidence dan operation berasal dari candidate/extraction run sama;
- producer `prose.version.create` mendahului evidence consumer;
- repair evidence menunjuk repaired prose version, bukan source lama.

### 7.3 Contract allowlists and limits

| Contract | Allowed group | Maksimum total |
|---|---|---:|
| `intake` | `foundation.update` | 8 |
| `foundation` | foundation, character, fact, reveal | 32 |
| `outline` | outline, reveal, breadcrumb | 64 |
| `beat.write` | prose create, state, belief, disclosure, fact, prose accept | 32 |
| `repair` | prose create, state, belief, disclosure, fact, prose accept | 32 |

Batas tambahan:

- maksimum 64 operasi per candidate sebagai hard global cap;
- maksimum 32 entity creations;
- maksimum 16 dependencies per operation;
- `tempRef` 1–64 karakter dan cocok `^[A-Za-z][A-Za-z0-9_-]*$`;
- duplicate `tempRef` ditolak;
- unknown operation dan operation di luar allowlist ditolak.

`beat.write` dan `repair` wajib memiliki tepat satu `prose.version.create` dan tepat satu `prose.accept`. Contract lain melarang `prose.accept`.

### 7.4 TempRef resolution

Scope reference adalah satu generated candidate.

1. Validasi suggestion dan contract.
2. Normalisasi setiap suggestion.
3. Kumpulkan declaration `tempRef` dari create operations.
4. Tolak duplicate declaration.
5. Alokasikan ID untuk create operations melalui injected deterministic `IdAllocator`.
6. Resolve temporary targets dan payload references.
7. Tolak missing atau cross-candidate reference.
8. Isi fields dari canonical snapshot.
9. Bangun dependency graph.

```ts
type IdAllocator = (entityType: EntityType, localRef: string) => string;
```

Core tidak memilih UUID/CUID dan tidak memakai randomness.

### 7.5 DAG and stable topological sort

Node identity memakai `localRef`. Edge `A → B` berarti A harus diterapkan sebelum B.

Edges berasal dari:

- explicit `dependsOn`;
- temporary-reference producer sebelum consumer;
- parent entity sebelum child;
- fact sebelum belief/disclosure/reveal yang merujuk fact;
- `prose.version.create` sebelum `state.append`, `belief.append`, `disclosure.append`, dan prose-derived fact operations;
- semua operasi selain accept sebelum `prose.accept`.

Validasi graph:

- missing node ditolak;
- self-edge ditolak;
- duplicate edge dideduplikasi;
- cycle ditolak dan error memuat stable-sorted cycle node IDs;
- reference antar-candidate tidak dapat direpresentasikan dan ditolak saat resolution.

Stable Kahn topological sort memakai ready queue berurutan:

1. `operationType`
2. `targetEntityType`
3. resolved `targetId`
4. `localRef`

Ordinal mulai 0. Hasil tidak bergantung pada urutan suggestion yang semantically equivalent. `prose.accept` diverifikasi tepat satu dan terakhir untuk `beat.write`/`repair`.

### 7.6 Operations hash

Hash dihitung setelah canonical values dan ordinal final tersedia.

Prefix:

```text
narraza-canonical-operations:v1\n
```

Hash material adalah ordered array berisi:

- `schemaVersion`
- `ordinal`
- `operationType`
- `targetEntityType`
- `targetId`
- `expectedRevision`
- `risk`
- `payload`

`operationId` tidak masuk hash agar retry resolution dapat memakai record IDs baru tanpa mengubah makna proposal. Serializer dan SHA-256 mengikuti W1.2.

### 7.7 Repair re-extraction

Repair resolution membawa:

```ts
interface RepairExtractionBinding {
  sourceProseVersionId: string;
  repairedProseVersionId: string;
  extractionSourceProseVersionId: string;
}
```

Syarat:

- `extractionSourceProseVersionId === repairedProseVersionId`;
- repaired version berbeda dari source version;
- state/belief/disclosure/fact operations berasal dari extraction run baru dan membawa evidence repaired prose;
- `prose.accept` menunjuk repaired version hasil candidate sama.

Pelanggaran menghasilkan `REPAIR_REEXTRACTION_REQUIRED`.

### 7.8 Operation errors

Minimum error codes:

- `INVALID_SUGGESTION`
- `UNKNOWN_OPERATION`
- `OPERATION_NOT_ALLOWED`
- `OPERATION_LIMIT_EXCEEDED`
- `DUPLICATE_TEMP_REF`
- `UNRESOLVED_TEMP_REF`
- `INVALID_DEPENDENCY`
- `DEPENDENCY_CYCLE`
- `REVISION_REQUIRED`
- `PROSE_ACCEPT_REQUIRED`
- `PROSE_ACCEPT_NOT_LAST`
- `REPAIR_REEXTRACTION_REQUIRED`
- `INVALID_PROSE_EVIDENCE_BINDING`

## 8. Testing strategy

Gunakan Vitest colocated unit tests dengan input fixtures kecil dan deterministic. Test tidak memakai DB atau network.

### W1.2

- `narrative-position.test.ts`
- `reveal-policy.test.ts`
- `expression-policy.test.ts`
- `belief-transition.test.ts`
- `disclosure-fold.test.ts`
- `foundation-readiness.test.ts`
- `canonical-json.test.ts`
- `dependency-hash.test.ts`
- `stale-policy.test.ts`
- `prose-policy.test.ts`
- `repair-policy.test.ts`

### W1.3

- `writer-packet-leak.test.ts`
- `writer-guidance-safe.test.ts`
- packet builder validation tests
- compile-time type-boundary fixture

### W1.4

- structural validator tests
- exact/alias/co-occurrence/proximity matcher tests
- `merge-findings.test.ts`
- `to-public-finding.test.ts`
- adversarial `prompt-injection-guard` policy fixtures

### W1.5

- `op-type-boundary` compile-time and runtime tests
- `tempref-resolve.test.ts`
- `op-allowlist.test.ts`
- `operation-topo-sort.test.ts`
- `operations-hash.test.ts`
- `prose-accept-order.test.ts`
- `repair-reextract.test.ts`

Property-style deterministic cases boleh ditambahkan tanpa dependency baru: permutasi input set yang sama harus menghasilkan fold/order/hash sama ketika semantics sama.

## 9. Acceptance criteria

- Semua W1.2–W1.5 tests hijau melalui root Unit Tests job.
- `pnpm typecheck`, lint, format check, dan architecture boundaries hijau.
- Setiap policy memiliki test file khusus.
- Writer and repair packets tidak dapat membawa restricted truth melalui type assignment atau runtime fixture.
- Global canonical bump tanpa manifest change tidak invalidasi proposal.
- Model findings tidak dapat menghapus/menurunkan deterministic blocker.
- Equivalent operation graphs menghasilkan stable topo order dan operations hash sama.
- `prose.accept` tepat satu dan terakhir pada `beat.write`/`repair`.
- Tidak ada dependency baru kecuali kebutuhan SHA-256 tidak dapat dipenuhi Node standard library.
- `docs/PROGRESS-CHECKLIST.md` diperbarui ketika masing-masing PR merge, bukan saat baru direncanakan.
