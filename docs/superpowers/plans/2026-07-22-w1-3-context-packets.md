# W1.3 Context Packets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyediakan lima context packet berklasifikasi data dengan builder strict-allowlist yang mencegah data restricted masuk writer, repair, extraction yang salah mode, atau packet mana pun sebagai `service_restricted`.

**Architecture:** `packages/core/src/context/packet-types.ts` mendefinisikan closed discriminated unions, input shape publik, dan output packet ber-brand `unique symbol` internal. `packet-builders.ts` menjadi satu-satunya constructor output: memvalidasi metadata, kind/data class, exact keys, referensi, dan ID unik, lalu membuat deep copy dari allowlist tanpa object spread; tidak ada generic `buildPacket`. Semua kode pure, tanpa DB, HTTP, Next.js, React, Prisma, AI provider, atau network.

**Tech Stack:** TypeScript 5.9 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Node.js 22, pnpm 11.9, Vitest 4.1, dependency-cruiser.

---

## Prasyarat branch dan scope

W1.3 baru dimulai setelah PR W1.2 `feat/m1-core-policies` merge. Jangan membuat branch W1.3 dari branch spec atau branch W1.2 yang belum merge.

- [ ] **Buat branch dari `master` sesudah W1.2 merge**

```bash
git switch master
git pull --ff-only
git switch -c feat/m1-context-packets
```

Expected:

```text
Switched to a new branch 'feat/m1-context-packets'
```

- [ ] **Verifikasi prerequisite W1.2 dan baseline bersih**

Run:

```bash
test -f packages/core/src/narrative/reveal-policy.ts
test -f packages/core/src/dependency/dependency-manifest.ts
pnpm --filter @narraza/core test:unit
git status --short
```

Expected: dua `test -f` exit `0`; seluruh W1.2 core tests PASS; `git status --short` tidak mencetak perubahan. Bila nama export W1.2 berbeda dari `WriterRevealGuidance`, sesuaikan import saja tanpa mengubah kontrak field spesifikasi.

- [ ] **Jaga scope PR**

Allowed implementation paths hanya file pada File Map di bawah. Jangan menyentuh Prisma, migration, application, AI, app, `docs/PROGRESS-CHECKLIST.md`, atau dependency lockfile. `docs/PROGRESS-CHECKLIST.md` baru diperbarui saat PR merge sesuai spec.

## File map

| Path | Action | Responsibility |
|---|---|---|
| `docs/verification-matrix.md` | Modify | Mendaftarkan runtime/type invariants W1.3 sebelum test baru dibuat. |
| `packages/core/src/context/packet-types.ts` | Create | Data classes, metadata, exact packet/input types, extraction modes, typed errors, internal brands. |
| `packages/core/src/context/packet-builders.ts` | Create | Strict runtime validators, allowlist cloning, duplicate/reference checks, lima builder publik. |
| `packages/core/src/context/index.ts` | Create | Explicit public barrel context; tidak mengekspor brand/helper internal. |
| `packages/core/src/context/packet-builders.test.ts` | Create | Metadata, exact-key, mismatch, service-restricted, duplicate ID, reference, immutable-copy tests. |
| `packages/core/src/context/writer-packet-leak.test.ts` | Create | Runtime fixture yang membuktikan restricted/planner-only fields tidak dapat masuk writer. |
| `packages/core/src/context/writer-guidance-safe.test.ts` | Create | Writer guidance hanya menyalin status dan safe directives. |
| `packages/core/src/context/repair-packet.test.ts` | Create | Repair menerima directive tersanitasi dan menolak finding internal/unsanitized. |
| `packages/core/src/context/extraction-packet.test.ts` | Create | Fixed use-case/data-class mapping dan payload allowlist extraction. |
| `packages/core/src/context/packet-type-boundary.typecheck.ts` | Create | Final compile-time non-assignability fixture; excluded from production tsconfig. |
| `packages/core/tsconfig.type-tests.json` | Create | Menjalankan fixture compile-time di luar production build. |
| `packages/core/tsconfig.json` | Modify | Mengecualikan `*.typecheck.ts` dari production build/declarations. |
| `packages/core/package.json` | Modify | Menambahkan `test:types` dan memasukkannya ke `test:unit`. |
| `packages/core/src/index.ts` | Modify | Mengekspor namespace `context` secara eksplisit. |

## Kontrak terkunci

Gunakan nama dan shape berikut secara konsisten pada seluruh task. Tidak ada generic packet builder, index signature, `Record<string, unknown>` payload, `unknown` payload, passthrough metadata, atau object spread dari input.

```ts
export type DataClass =
  | 'writer_safe'
  | 'review_safe'
  | 'author_private'
  | 'service_restricted';

export interface PacketMetadata {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly policyVersion: 'domain-core/v1';
}

export type ContextPacket =
  | PlannerContextPacket
  | WriterContextPacket
  | ValidatorContextPacket
  | RepairContextPacket
  | ExtractionContextPacket;
```

Error runtime wajib berupa `ContextPacketError` dengan closed codes berikut:

```ts
export type ContextPacketErrorCode =
  | 'INVALID_PACKET'
  | 'UNKNOWN_KEY'
  | 'PACKET_KIND_MISMATCH'
  | 'DATA_CLASS_MISMATCH'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_POLICY_VERSION'
  | 'INVALID_DEPENDENCY_HASH'
  | 'DUPLICATE_ENTITY_ID'
  | 'UNRESOLVED_REFERENCE'
  | 'SERVICE_RESTRICTED_DATA';
```

## Task 1: Verification contracts

**Files:**
- Modify: `docs/verification-matrix.md`

**Global Constraints:**
- Edit hanya path pada daftar **Files** task ini; tanpa dependency baru, DB, network, framework, provider, production context implementation, fixture type, config, atau script wiring.

- [ ] **Step 1: Tambah invariants W1.3 ke verification matrix sebelum test**

Tambahkan empat baris pada akhir tabel, tepat sebelum paragraf `When adding invariants:`. Jangan menyisipkan row di tengah tabel:

```markdown
| Context packet runtime boundaries reject unknown keys, duplicate IDs, and kind/class mismatch | S3 | `packet-builders` | unit |
| Repair packet rejects unsanitized/internal validation finding | S3 | `repair-packet` | unit |
| Extraction use case has fixed data class and rejects mismatch | S3 | `extraction-packet` | unit |
| Restricted projections are not assignable to writer/repair fields at compile time | S3 | `packet-type-boundary` | unit |
```

- [ ] **Step 2: Format dan verifikasi contract documentation**

```bash
pnpm exec prettier --write docs/verification-matrix.md >/dev/null
pnpm exec prettier --check docs/verification-matrix.md
pnpm --filter @narraza/core build
git diff --check
```

Expected: seluruh command exit `0`; Prettier melaporkan `All matched files use Prettier code style!`; core build tanpa TypeScript diagnostic; `git diff --check` tanpa output.

- [ ] **Step 3: Commit verification contract**

```bash
git add docs/verification-matrix.md
git commit -m "docs: register W1.3 packet invariants"
```

Expected: commit berhasil dan hanya `docs/verification-matrix.md` tercatat. Commit tetap buildable karena compile-time fixture/config/script belum dipasang.

## Task 2: Closed packet types dan metadata contract

**Files:**
- Create: `packages/core/src/context/packet-types.ts`
- Create: `packages/core/src/context/index.ts`
- Modify: `packages/core/src/index.ts`

**Global Constraints:**
- Production types closed, readonly, tanpa index signature, generic payload, exported brand symbol, atau public adversarial finding type.
- Task ini belum membuat `packet-builders.ts`; barrel dilarang mere-export builder yang belum diimplementasikan.

**Interfaces:**
- `packet-types.ts` mendefinisikan seluruh packet input/output, `ContextPacketError`, writer-safe beat contract, dan W1.4-compatible `ValidatorBeatContract` terpisah.
- `context/index.ts` pada task ini mengekspor types/constants/error saja; `packages/core/src/index.ts` mengekspor namespace `context`.

- [ ] **Step 1: Verifikasi baseline types sebelum menambah model**

```bash
pnpm --filter @narraza/core build
```

Expected: exit `0`; baseline menghasilkan declaration tanpa TypeScript diagnostic.

- [ ] **Step 2: Definisikan complete domain shapes**

Buat `packages/core/src/context/packet-types.ts`. Gunakan import type W1.2 berikut:

```ts
import type { NarrativePosition } from '../narrative/position.js';
import type { WriterRevealGuidance } from '../narrative/reveal-policy.js';

declare const writerSafeProjectionBrand: unique symbol;
declare const restrictedProjectionBrand: unique symbol;

export const PACKET_SCHEMA_VERSION = 1 as const;
export const PACKET_POLICY_VERSION = 'domain-core/v1' as const;

export type DataClass =
  | 'writer_safe'
  | 'review_safe'
  | 'author_private'
  | 'service_restricted';

export interface PacketMetadata {
  readonly schemaVersion: typeof PACKET_SCHEMA_VERSION;
  readonly projectId: string;
  readonly dependencyHash: string;
  readonly policyVersion: typeof PACKET_POLICY_VERSION;
}

export interface FoundationPlanningContext {
  readonly coreConcept: string;
  readonly conflict: string;
  readonly endingDirection: string;
  readonly readerPromise: string;
}

export interface PlannerCharacter {
  readonly id: string;
  readonly name: string;
  readonly identity: string;
  readonly goal: string;
  readonly motivation: string;
  readonly privateNotes: readonly string[];
}

export interface AuthorPrivateFact {
  readonly dataClass: 'author_private';
  readonly id: string;
  readonly factKey: string;
  readonly truth: string;
  readonly visibility: 'canonical' | 'planner_only';
}

export interface PlannerReveal {
  readonly id: string;
  readonly factId: string;
  readonly targetPosition: NarrativePosition;
  readonly breadcrumbPositions: readonly NarrativePosition[];
}

export interface FutureOutlineItem {
  readonly id: string;
  readonly position: NarrativePosition;
  readonly purpose: string;
}

export interface WriterSafeBeatContract {
  readonly beatId: string;
  readonly purpose: string;
  readonly sceneGoal: string;
  readonly directives: readonly string[];
}

export interface ValidatorBeatDirective {
  readonly directiveKey: string;
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorProhibitedAction {
  readonly actionKey: string;
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorEndingRequirement {
  readonly description: string;
  readonly lexicalEvidence?: readonly string[];
}

export interface ValidatorLengthRange {
  readonly min: number;
  readonly max: number;
}

export interface ValidatorBeatContract {
  readonly beatId: string;
  readonly purpose: string;
  readonly requiredCharacterIds: readonly string[];
  readonly requiredFactKeys: readonly string[];
  readonly requiredDirectives: readonly ValidatorBeatDirective[];
  readonly prohibitedActions: readonly ValidatorProhibitedAction[];
  readonly endingRequirement?: ValidatorEndingRequirement;
  readonly lengthRange?: ValidatorLengthRange;
}

export interface BehavioralCharacterDirective {
  readonly characterId: string;
  readonly directives: readonly string[];
}

export interface WriterSafeFact {
  readonly dataClass: 'writer_safe';
  readonly id: string;
  readonly factKey: string;
  readonly safeStatement: string;
}

export interface WriterRevealGuidanceItem {
  readonly revealId: string;
  readonly guidance: WriterRevealGuidance;
}

export interface AcceptedProseContext {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly excerpt: string;
}

export interface ValidatorProse {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly content: string;
}

export interface RestrictedGuard {
  readonly guardKey: string;
  readonly prohibitedExact: readonly string[];
  readonly prohibitedAliases: readonly string[];
  readonly coOccurrenceGroups: readonly (readonly string[])[];
  readonly proximityGroups: readonly (readonly string[])[];
  readonly semanticReviewRequired: boolean;
}

export interface ContinuityRule {
  readonly ruleKey: string;
  readonly instruction: string;
  readonly restrictedEvidence: readonly string[];
}

export interface RepairableProse {
  readonly proseVersionId: string;
  readonly beatId: string;
  readonly content: string;
}

export interface FindingLocationInput {
  readonly startUtf16: number;
  readonly endUtf16: number;
}

export interface RepairDirective {
  readonly findingKey: string;
  readonly publicMessageCode: string;
  readonly instruction: string;
  readonly location?: FindingLocationInput;
}

export interface IntakeSignalMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface PublicStructureProse {
  readonly proseVersionId: string;
  readonly content: string;
}

export interface CanonReconciliationCharacter {
  readonly id: string;
  readonly identity: string;
}

interface PacketBase<K extends string, D extends DataClass> {
  readonly kind: K;
  readonly dataClass: D;
  readonly metadata: PacketMetadata;
}

export interface PlannerPacketInput extends PacketBase<'planner', 'author_private'> {
  readonly foundation: FoundationPlanningContext;
  readonly characters: readonly PlannerCharacter[];
  readonly facts: readonly AuthorPrivateFact[];
  readonly reveals: readonly PlannerReveal[];
  readonly futureOutline: readonly FutureOutlineItem[];
}

export interface WriterPacketInput extends PacketBase<'writer', 'writer_safe'> {
  readonly beatContract: WriterSafeBeatContract;
  readonly characterDirectives: readonly BehavioralCharacterDirective[];
  readonly establishedFacts: readonly WriterSafeFact[];
  readonly revealGuidance: readonly WriterRevealGuidanceItem[];
  readonly acceptedProseContext: readonly AcceptedProseContext[];
}

export interface ValidatorPacketInput extends PacketBase<'validator', 'author_private'> {
  readonly prose: ValidatorProse;
  readonly beatContract: ValidatorBeatContract;
  readonly restrictedGuardSets: readonly RestrictedGuard[];
  readonly continuityRules: readonly ContinuityRule[];
}

export interface RepairPacketInput extends PacketBase<'repair', 'writer_safe'> {
  readonly repairableProse: RepairableProse;
  readonly directives: readonly RepairDirective[];
  readonly beatContract: WriterSafeBeatContract;
  readonly revealGuidance: readonly WriterRevealGuidanceItem[];
}

export interface IntakeSignalsExtractionInput
  extends PacketBase<'extraction', 'review_safe'> {
  readonly useCase: 'intake_signals';
  readonly messages: readonly IntakeSignalMessage[];
}

export interface ProsePublicStructureExtractionInput
  extends PacketBase<'extraction', 'review_safe'> {
  readonly useCase: 'prose_public_structure';
  readonly prose: PublicStructureProse;
}

export interface CanonReconciliationExtractionInput
  extends PacketBase<'extraction', 'author_private'> {
  readonly useCase: 'canon_reconciliation';
  readonly prose: ValidatorProse;
  readonly facts: readonly AuthorPrivateFact[];
  readonly characters: readonly CanonReconciliationCharacter[];
}

export type ExtractionPacketInput =
  | IntakeSignalsExtractionInput
  | ProsePublicStructureExtractionInput
  | CanonReconciliationExtractionInput;

export interface PlannerContextPacket extends PlannerPacketInput {
  readonly [restrictedProjectionBrand]: true;
}

export interface WriterContextPacket extends WriterPacketInput {
  readonly [writerSafeProjectionBrand]: true;
}

export interface ValidatorContextPacket extends ValidatorPacketInput {
  readonly [restrictedProjectionBrand]: true;
}

export interface RepairContextPacket extends RepairPacketInput {
  readonly [writerSafeProjectionBrand]: true;
}

export type ExtractionContextPacket =
  | (IntakeSignalsExtractionInput & { readonly [writerSafeProjectionBrand]: true })
  | (ProsePublicStructureExtractionInput & {
      readonly [writerSafeProjectionBrand]: true;
    })
  | (CanonReconciliationExtractionInput & {
      readonly [restrictedProjectionBrand]: true;
    });

export type ContextPacket =
  | PlannerContextPacket
  | WriterContextPacket
  | ValidatorContextPacket
  | RepairContextPacket
  | ExtractionContextPacket;

export type ContextPacketErrorCode =
  | 'INVALID_PACKET'
  | 'UNKNOWN_KEY'
  | 'PACKET_KIND_MISMATCH'
  | 'DATA_CLASS_MISMATCH'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_POLICY_VERSION'
  | 'INVALID_DEPENDENCY_HASH'
  | 'DUPLICATE_ENTITY_ID'
  | 'UNRESOLVED_REFERENCE'
  | 'SERVICE_RESTRICTED_DATA';

export class ContextPacketError extends Error {
  readonly code: ContextPacketErrorCode;
  readonly path: string;

  constructor(code: ContextPacketErrorCode, path: string, message: string) {
    super(message);
    this.name = 'ContextPacketError';
    this.code = code;
    this.path = path;
  }
}
```

Brand symbols tidak diekspor. Shape adversarial internal finding hanya didefinisikan lokal di `packet-type-boundary.typecheck.ts`; production types dan public barrel tidak mendeklarasikan atau mengekspornya.

- [ ] **Step 3: Buat public barrel types dan root namespace**

Buat `packages/core/src/context/index.ts`:

```ts
export {
  ContextPacketError,
  PACKET_POLICY_VERSION,
  PACKET_SCHEMA_VERSION,
  type AcceptedProseContext,
  type AuthorPrivateFact,
  type BehavioralCharacterDirective,
  type CanonReconciliationExtractionInput,
  type ContextPacket,
  type ContextPacketErrorCode,
  type ContinuityRule,
  type DataClass,
  type ExtractionContextPacket,
  type ExtractionPacketInput,
  type FindingLocationInput,
  type FoundationPlanningContext,
  type FutureOutlineItem,
  type IntakeSignalsExtractionInput,
  type IntakeSignalMessage,
  type PacketMetadata,
  type PlannerCharacter,
  type PlannerContextPacket,
  type PlannerPacketInput,
  type PlannerReveal,
  type ProsePublicStructureExtractionInput,
  type PublicStructureProse,
  type RepairContextPacket,
  type RepairDirective,
  type RepairPacketInput,
  type RepairableProse,
  type RestrictedGuard,
  type ValidatorContextPacket,
  type ValidatorBeatContract,
  type ValidatorBeatDirective,
  type ValidatorEndingRequirement,
  type ValidatorLengthRange,
  type ValidatorPacketInput,
  type ValidatorProhibitedAction,
  type ValidatorProse,
  type WriterContextPacket,
  type WriterPacketInput,
  type WriterRevealGuidanceItem,
  type WriterSafeBeatContract,
  type WriterSafeFact,
} from './packet-types.js';

```

Tambahkan ke akhir `packages/core/src/index.ts`:

```ts
export * as context from './context/index.js';
```

Jangan `export *` context pada root; namespace mempertahankan boundary eksplisit seperti `auth`.

- [ ] **Step 4: Format dan build closed type model**

```bash
pnpm exec prettier --write packages/core/src/context/packet-types.ts packages/core/src/context/index.ts packages/core/src/index.ts >/dev/null
pnpm exec prettier --check packages/core/src/context/packet-types.ts packages/core/src/context/index.ts packages/core/src/index.ts
pnpm --filter @narraza/core build
git diff --check
```

Expected: seluruh command exit `0`; tidak ada builder export yang belum ada; production declaration build hijau; `git diff --check` tanpa output.

- [ ] **Step 5: Commit closed type model**

```bash
git add packages/core/src/context/packet-types.ts packages/core/src/context/index.ts packages/core/src/index.ts
git commit -m "feat(core): define context packet type model"
```

Expected: commit berisi type model dan barrels saja; `pnpm --filter @narraza/core build` tetap exit `0` pada commit ini.

## Task 3: Strict runtime boundary dan planner/writer builders

**Files:**
- Create: `packages/core/src/context/packet-builders.ts`
- Modify: `packages/core/src/context/index.ts`
- Create: `packages/core/src/context/packet-builders.test.ts`
- Create: `packages/core/src/context/writer-packet-leak.test.ts`
- Create: `packages/core/src/context/writer-guidance-safe.test.ts`

**Global Constraints:**
- Semua raw runtime object memakai exact-key validation; production builder tidak spread input aggregate, tidak `structuredClone`, dan tidak JSON round-trip.
- Hanya builder yang selesai pada task ini boleh ditambahkan ke barrel: planner dan writer.

**Interfaces:**
- `buildPlannerPacket(PlannerPacketInput): PlannerContextPacket` memvalidasi author-private planner references dan IDs.
- `buildWriterPacket(WriterPacketInput): WriterContextPacket` menerima writer-safe fields; nested reveal guidance menerima tepat `status` dan `safeDirectives`.

- [ ] **Step 1: Buat failing metadata dan strict-boundary tests**

Buat `packages/core/src/context/packet-builders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ContextPacketError,
  buildPlannerPacket,
  buildWriterPacket,
  type WriterPacketInput,
} from './index.js';

const metadata = {
  schemaVersion: 1,
  projectId: 'project-1',
  dependencyHash: 'a'.repeat(64),
  policyVersion: 'domain-core/v1',
} as const;

const writerInput = (): WriterPacketInput => ({
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata,
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Force a choice',
    sceneGoal: 'Mira refuses the offer',
    directives: ['Show hesitation through action'],
  },
  characterDirectives: [],
  establishedFacts: [],
  revealGuidance: [],
  acceptedProseContext: [],
});

describe('packet metadata', () => {
  it.each([
    ['schemaVersion', 2, 'UNSUPPORTED_SCHEMA_VERSION'],
    ['policyVersion', 'domain-core/v2', 'UNSUPPORTED_POLICY_VERSION'],
    ['dependencyHash', 'ABC', 'INVALID_DEPENDENCY_HASH'],
  ] as const)('rejects invalid %s', (key, value, code) => {
    const input: Record<string, unknown> = { ...writerInput() };
    input.metadata = { ...metadata, [key]: value };
    expect(() => buildWriterPacket(input as never)).toThrowError(
      expect.objectContaining<Partial<ContextPacketError>>({ code }),
    );
  });

  it('rejects empty projectId', () => {
    expect(() =>
      buildWriterPacket({
        ...writerInput(),
        metadata: { ...metadata, projectId: '   ' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('returns fixed writer discrimination', () => {
    const packet = buildWriterPacket(writerInput());
    expect(packet.kind).toBe('writer');
    expect(packet.dataClass).toBe('writer_safe');
    expect(packet.metadata).toEqual(metadata);
  });
});

it('rejects unknown top-level and nested keys', () => {
  const top = { ...writerInput(), truth: 'the heir is alive' };
  expect(() => buildWriterPacket(top as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: '$.truth' }),
  );

  const nested = {
    ...writerInput(),
    beatContract: { ...writerInput().beatContract, futureOutline: 'ambush' },
  };
  expect(() => buildWriterPacket(nested as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: '$.beatContract.futureOutline' }),
  );
});

it.each([
  ['kind', 'planner', 'PACKET_KIND_MISMATCH'],
  ['dataClass', 'author_private', 'DATA_CLASS_MISMATCH'],
] as const)('rejects writer %s mismatch', (key, value, code) => {
  expect(() => buildWriterPacket({ ...writerInput(), [key]: value } as never)).toThrowError(
    expect.objectContaining({ code }),
  );
});

it.each(['serviceSecret', 'apiKey', 'credentials', 'providerMetadata', 'securityConfig'])(
  'rejects service-restricted key %s',
  (key) => {
    expect(() => buildWriterPacket({ ...writerInput(), [key]: 'secret' } as never)).toThrowError(
      expect.objectContaining({ code: 'SERVICE_RESTRICTED_DATA' }),
    );
  },
);

it('rejects duplicate entity IDs', () => {
  const fact = {
    dataClass: 'author_private',
    id: 'fact-1',
    factKey: 'heir_alive',
    truth: 'The heir is alive',
    visibility: 'canonical',
  } as const;
  expect(() =>
    buildPlannerPacket({
      kind: 'planner',
      dataClass: 'author_private',
      metadata,
      foundation: {
        coreConcept: 'Trust after betrayal',
        conflict: 'Mira must choose',
        endingDirection: 'Mira tells the truth',
        readerPromise: 'A fair mystery',
      },
      characters: [],
      facts: [fact, fact],
      reveals: [],
      futureOutline: [],
    }),
  ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
});

it('rejects unresolved planner fact references', () => {
  expect(() =>
    buildPlannerPacket({
      kind: 'planner',
      dataClass: 'author_private',
      metadata,
      foundation: {
        coreConcept: 'Trust after betrayal',
        conflict: 'Mira must choose',
        endingDirection: 'Mira tells the truth',
        readerPromise: 'A fair mystery',
      },
      characters: [],
      facts: [],
      reveals: [
        {
          id: 'reveal-1',
          factId: 'missing-fact',
          targetPosition: { chapterId: 'chapter-2', sequence: 20 },
          breadcrumbPositions: [{ chapterId: 'chapter-1', sequence: 10 }],
        },
      ],
      futureOutline: [],
    }),
  ).toThrowError(expect.objectContaining({ code: 'UNRESOLVED_REFERENCE' }));
});
```

- [ ] **Step 2: Buat writer leak fixture merah**

Buat `writer-packet-leak.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildWriterPacket, type WriterPacketInput } from './index.js';

const safeInput: WriterPacketInput = {
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'b'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Mira tests Raka',
    sceneGoal: 'End with a refusal',
    directives: ['Use a visible pause before the answer'],
  },
  characterDirectives: [{ characterId: 'character-1', directives: ['Avoid eye contact'] }],
  establishedFacts: [
    {
      dataClass: 'writer_safe',
      id: 'fact-safe-1',
      factKey: 'mira_arrived',
      safeStatement: 'Mira arrived before dusk',
    },
  ],
  revealGuidance: [
    { revealId: 'reveal-1', guidance: { status: 'hold', safeDirectives: ['Do not resolve it'] } },
  ],
  acceptedProseContext: [
    { proseVersionId: 'prose-1', beatId: 'beat-0', excerpt: 'Rain covered the road.' },
  ],
};

describe('writer-packet-leak', () => {
  it.each([
    ['truth', 'The heir is alive'],
    ['rawBeliefs', [{ characterId: 'character-1', belief: 'The heir is alive' }]],
    ['restrictedAliases', ['the lost prince']],
    ['restrictedGuardSets', []],
    ['futureOutline', [{ id: 'beat-9' }]],
    ['plannerOnlyFacts', []],
    ['unrevealedFacts', []],
    ['authorPrivate', { truth: 'The heir is alive' }],
  ])('rejects restricted top-level field %s', (key, value) => {
    expect(() => buildWriterPacket({ ...safeInput, [key]: value } as never)).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_KEY' }),
    );
  });

  it('does not retain source arrays or unknown properties', () => {
    const directives = ['Use a visible pause before the answer'];
    const input = {
      ...safeInput,
      beatContract: { ...safeInput.beatContract, directives },
    };
    const packet = buildWriterPacket(input);
    directives.push('Reveal the hidden truth');
    expect(packet.beatContract.directives).toEqual(['Use a visible pause before the answer']);
    expect(Object.keys(packet).sort()).toEqual([
      'acceptedProseContext',
      'beatContract',
      'characterDirectives',
      'dataClass',
      'establishedFacts',
      'kind',
      'metadata',
      'revealGuidance',
    ]);
  });
});
```

- [ ] **Step 3: Buat writer-guidance-safe fixture merah**

Buat `writer-guidance-safe.test.ts`:

```ts
import { expect, it } from 'vitest';
import { buildWriterPacket, type WriterPacketInput } from './index.js';

it('writer-guidance-safe copies only revealId, status, and safeDirectives', () => {
  const input: WriterPacketInput = {
    kind: 'writer',
    dataClass: 'writer_safe',
    metadata: {
      schemaVersion: 1,
      projectId: 'project-1',
      dependencyHash: 'c'.repeat(64),
      policyVersion: 'domain-core/v1',
    },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Delay disclosure',
      sceneGoal: 'End on doubt',
      directives: [],
    },
    characterDirectives: [],
    establishedFacts: [],
    revealGuidance: [
      {
        revealId: 'reveal-1',
        guidance: { status: 'breadcrumb_due', safeDirectives: ['Mention the empty frame'] },
      },
    ],
    acceptedProseContext: [],
  };

  expect(buildWriterPacket(input).revealGuidance).toEqual([
    {
      revealId: 'reveal-1',
      guidance: { status: 'breadcrumb_due', safeDirectives: ['Mention the empty frame'] },
    },
  ]);

  for (const [key, value] of [
    ['truth', 'The portrait subject is alive'],
    ['prohibitedExact', ['The portrait subject is alive']],
  ] as const) {
    const adversarial = {
      ...input,
      revealGuidance: [
        {
          revealId: 'reveal-1',
          guidance: {
            status: 'breadcrumb_due',
            safeDirectives: ['Mention the empty frame'],
            [key]: value,
          },
        },
      ],
    };
    expect(() => buildWriterPacket(adversarial as never)).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_KEY', path: `$.revealGuidance[0].guidance.${key}` }),
    );
  }
});
```

Test menetapkan raw runtime boundary guidance: hanya `status` dan `safeDirectives` diterima. Adversarial `truth` dan `prohibitedExact` wajib ditolak, bukan dibuang diam-diam.

- [ ] **Step 4: Jalankan focused tests dan verifikasi merah**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context/packet-builders.test.ts src/context/writer-packet-leak.test.ts src/context/writer-guidance-safe.test.ts
```

Expected: FAIL karena builders belum ada.

- [ ] **Step 5: Implementasikan strict validation primitives**

Buat awal `packet-builders.ts` dengan imports dan helpers berikut. Semua helper tetap internal.

```ts
import {
  ContextPacketError,
  PACKET_POLICY_VERSION,
  PACKET_SCHEMA_VERSION,
  type AcceptedProseContext,
  type AuthorPrivateFact,
  type BehavioralCharacterDirective,
  type ContextPacketErrorCode,
  type ExtractionContextPacket,
  type ExtractionPacketInput,
  type FindingLocationInput,
  type FoundationPlanningContext,
  type FutureOutlineItem,
  type IntakeSignalMessage,
  type PacketMetadata,
  type PlannerCharacter,
  type PlannerContextPacket,
  type PlannerPacketInput,
  type PlannerReveal,
  type PublicStructureProse,
  type RepairContextPacket,
  type RepairDirective,
  type RepairPacketInput,
  type RepairableProse,
  type RestrictedGuard,
  type ValidatorBeatContract,
  type ValidatorBeatDirective,
  type ValidatorContextPacket,
  type ValidatorEndingRequirement,
  type ValidatorLengthRange,
  type ValidatorPacketInput,
  type ValidatorProhibitedAction,
  type ValidatorProse,
  type WriterContextPacket,
  type WriterPacketInput,
  type WriterRevealGuidanceItem,
  type WriterSafeBeatContract,
  type WriterSafeFact,
} from './packet-types.js';

const SHA256 = /^[0-9a-f]{64}$/;
const SERVICE_RESTRICTED_KEYS = new Set([
  'apiKey',
  'credential',
  'credentials',
  'providerMetadata',
  'securityConfig',
  'serviceRestricted',
  'serviceSecret',
]);

function fail(code: ContextPacketErrorCode, path: string, message: string): never {
  throw new ContextPacketError(code, path, message);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_PACKET', path, `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  const object = objectAt(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(object)) {
    if (SERVICE_RESTRICTED_KEYS.has(key)) {
      fail('SERVICE_RESTRICTED_DATA', `${path}.${key}`, `${path}.${key} is service restricted`);
    }
    if (!allowed.has(key)) {
      fail('UNKNOWN_KEY', `${path}.${key}`, `${path}.${key} is not allowed`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) {
      fail('INVALID_PACKET', `${path}.${key}`, `${path}.${key} is required`);
    }
  }
  return object;
}

function arrayAt(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail('INVALID_PACKET', path, `${path} must be an array`);
  return value;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_PACKET', path, `${path} must be a non-empty string`);
  }
  return value;
}

function literalAt<T extends string>(value: unknown, expected: T, path: string, code: ContextPacketErrorCode): T {
  if (value !== expected) fail(code, path, `${path} must be ${expected}`);
  return expected;
}

function cloneStrings(value: unknown, path: string): readonly string[] {
  return arrayAt(value, path).map((item, index) => stringAt(item, `${path}[${index}]`));
}

function uniqueStringsAt(value: unknown, path: string): readonly string[] {
  const strings = cloneStrings(value, path);
  if (new Set(strings).size !== strings.length) {
    fail('DUPLICATE_ENTITY_ID', path, `${path} contains duplicate values`);
  }
  return strings;
}

function assertUniqueIds(items: readonly { readonly id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail('DUPLICATE_ENTITY_ID', path, `duplicate entity id ${item.id}`);
    seen.add(item.id);
  }
}

function metadataAt(value: unknown): PacketMetadata {
  const item = exactObject(value, '$.metadata', [
    'schemaVersion',
    'projectId',
    'dependencyHash',
    'policyVersion',
  ]);
  if (item.schemaVersion !== PACKET_SCHEMA_VERSION) {
    fail('UNSUPPORTED_SCHEMA_VERSION', '$.metadata.schemaVersion', 'unsupported packet schema version');
  }
  if (item.policyVersion !== PACKET_POLICY_VERSION) {
    fail('UNSUPPORTED_POLICY_VERSION', '$.metadata.policyVersion', 'unsupported packet policy version');
  }
  const dependencyHash = stringAt(item.dependencyHash, '$.metadata.dependencyHash');
  if (!SHA256.test(dependencyHash)) {
    fail('INVALID_DEPENDENCY_HASH', '$.metadata.dependencyHash', 'dependency hash must be lowercase SHA-256');
  }
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    projectId: stringAt(item.projectId, '$.metadata.projectId'),
    dependencyHash,
    policyVersion: PACKET_POLICY_VERSION,
  };
}
```

Tambahkan helper exact clone untuk `NarrativePosition`, beat contract, fact, dan guidance. Optional `beatId` ditangani dengan dua exact key sets, bukan memasukkan `undefined`:

```ts
function positionAt(value: unknown, path: string) {
  const source = objectAt(value, path);
  const hasBeatId = Object.hasOwn(source, 'beatId');
  const item = exactObject(value, path, hasBeatId ? ['chapterId', 'beatId', 'sequence'] : ['chapterId', 'sequence']);
  if (!Number.isSafeInteger(item.sequence) || (item.sequence as number) < 0) {
    fail('INVALID_PACKET', `${path}.sequence`, 'sequence must be a non-negative safe integer');
  }
  return hasBeatId
    ? {
        chapterId: stringAt(item.chapterId, `${path}.chapterId`),
        beatId: stringAt(item.beatId, `${path}.beatId`),
        sequence: item.sequence as number,
      }
    : {
        chapterId: stringAt(item.chapterId, `${path}.chapterId`),
        sequence: item.sequence as number,
      };
}

function beatContractAt(value: unknown, path: string): WriterSafeBeatContract {
  const item = exactObject(value, path, ['beatId', 'purpose', 'sceneGoal', 'directives']);
  return {
    beatId: stringAt(item.beatId, `${path}.beatId`),
    purpose: stringAt(item.purpose, `${path}.purpose`),
    sceneGoal: stringAt(item.sceneGoal, `${path}.sceneGoal`),
    directives: cloneStrings(item.directives, `${path}.directives`),
  };
}

function writerFactAt(value: unknown, path: string): WriterSafeFact {
  const item = exactObject(value, path, ['dataClass', 'id', 'factKey', 'safeStatement']);
  literalAt(item.dataClass, 'writer_safe', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
  return {
    dataClass: 'writer_safe',
    id: stringAt(item.id, `${path}.id`),
    factKey: stringAt(item.factKey, `${path}.factKey`),
    safeStatement: stringAt(item.safeStatement, `${path}.safeStatement`),
  };
}

function guidanceAt(value: unknown, path: string): WriterRevealGuidanceItem {
  const item = exactObject(value, path, ['revealId', 'guidance']);
  const guidance = exactObject(item.guidance, `${path}.guidance`, ['status', 'safeDirectives']);
  const status = guidance.status;
  if (!['before_breadcrumb', 'breadcrumb_due', 'hold', 'reveal_due', 'revealed'].includes(status as string)) {
    fail('INVALID_PACKET', `${path}.guidance.status`, 'unsupported reveal guidance status');
  }
  return {
    revealId: stringAt(item.revealId, `${path}.revealId`),
    guidance: {
      status: status as WriterRevealGuidanceItem['guidance']['status'],
      safeDirectives: cloneStrings(guidance.safeDirectives, `${path}.guidance.safeDirectives`),
    },
  };
}
```

`guidanceAt` adalah raw runtime boundary. Nested guidance menerima tepat key `status` dan `safeDirectives`; `truth`, `prohibitedExact`, metadata privat, dan unknown key lain ditolak dengan `UNKNOWN_KEY`. Builder tetap membuat object baru dan menyalin `safeDirectives`.

- [ ] **Step 6: Implementasikan planner dan writer builder dengan object baru**

Tambahkan exact clone helpers untuk semua planner/writer child types dengan pola yang sama. Implementasi builder final harus setara dengan berikut:

```ts
export function buildPlannerPacket(input: PlannerPacketInput): PlannerContextPacket {
  const item = exactObject(input, '$', [
    'kind', 'dataClass', 'metadata', 'foundation', 'characters', 'facts', 'reveals', 'futureOutline',
  ]);
  literalAt(item.kind, 'planner', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'author_private', '$.dataClass', 'DATA_CLASS_MISMATCH');

  const foundationSource = exactObject(item.foundation, '$.foundation', [
    'coreConcept', 'conflict', 'endingDirection', 'readerPromise',
  ]);
  const foundation: FoundationPlanningContext = {
    coreConcept: stringAt(foundationSource.coreConcept, '$.foundation.coreConcept'),
    conflict: stringAt(foundationSource.conflict, '$.foundation.conflict'),
    endingDirection: stringAt(foundationSource.endingDirection, '$.foundation.endingDirection'),
    readerPromise: stringAt(foundationSource.readerPromise, '$.foundation.readerPromise'),
  };
  const characters: readonly PlannerCharacter[] = arrayAt(item.characters, '$.characters').map((value, index) => {
    const path = `$.characters[${index}]`;
    const source = exactObject(value, path, ['id', 'name', 'identity', 'goal', 'motivation', 'privateNotes']);
    return {
      id: stringAt(source.id, `${path}.id`),
      name: stringAt(source.name, `${path}.name`),
      identity: stringAt(source.identity, `${path}.identity`),
      goal: stringAt(source.goal, `${path}.goal`),
      motivation: stringAt(source.motivation, `${path}.motivation`),
      privateNotes: cloneStrings(source.privateNotes, `${path}.privateNotes`),
    };
  });
  const facts: readonly AuthorPrivateFact[] = arrayAt(item.facts, '$.facts').map((value, index) => {
    const path = `$.facts[${index}]`;
    const source = exactObject(value, path, ['dataClass', 'id', 'factKey', 'truth', 'visibility']);
    literalAt(source.dataClass, 'author_private', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
    if (source.visibility !== 'canonical' && source.visibility !== 'planner_only') {
      fail('INVALID_PACKET', `${path}.visibility`, 'unsupported planner fact visibility');
    }
    return {
      dataClass: 'author_private',
      id: stringAt(source.id, `${path}.id`),
      factKey: stringAt(source.factKey, `${path}.factKey`),
      truth: stringAt(source.truth, `${path}.truth`),
      visibility: source.visibility,
    };
  });
  const reveals: readonly PlannerReveal[] = arrayAt(item.reveals, '$.reveals').map((value, index) => {
    const path = `$.reveals[${index}]`;
    const source = exactObject(value, path, ['id', 'factId', 'targetPosition', 'breadcrumbPositions']);
    return {
      id: stringAt(source.id, `${path}.id`),
      factId: stringAt(source.factId, `${path}.factId`),
      targetPosition: positionAt(source.targetPosition, `${path}.targetPosition`),
      breadcrumbPositions: arrayAt(source.breadcrumbPositions, `${path}.breadcrumbPositions`).map((position, positionIndex) =>
        positionAt(position, `${path}.breadcrumbPositions[${positionIndex}]`),
      ),
    };
  });
  const futureOutline: readonly FutureOutlineItem[] = arrayAt(item.futureOutline, '$.futureOutline').map((value, index) => {
    const path = `$.futureOutline[${index}]`;
    const source = exactObject(value, path, ['id', 'position', 'purpose']);
    return {
      id: stringAt(source.id, `${path}.id`),
      position: positionAt(source.position, `${path}.position`),
      purpose: stringAt(source.purpose, `${path}.purpose`),
    };
  });
  assertUniqueIds(characters, '$.characters');
  assertUniqueIds(facts, '$.facts');
  assertUniqueIds(reveals, '$.reveals');
  assertUniqueIds(futureOutline, '$.futureOutline');
  const factIds = new Set(facts.map((fact) => fact.id));
  for (const reveal of reveals) {
    if (!factIds.has(reveal.factId)) {
      fail('UNRESOLVED_REFERENCE', '$.reveals', `reveal ${reveal.id} references missing fact ${reveal.factId}`);
    }
  }
  return {
    kind: 'planner',
    dataClass: 'author_private',
    metadata: metadataAt(item.metadata),
    foundation,
    characters,
    facts,
    reveals,
    futureOutline,
  } as PlannerContextPacket;
}

export function buildWriterPacket(input: WriterPacketInput): WriterContextPacket {
  const item = exactObject(input, '$', [
    'kind', 'dataClass', 'metadata', 'beatContract', 'characterDirectives',
    'establishedFacts', 'revealGuidance', 'acceptedProseContext',
  ]);
  literalAt(item.kind, 'writer', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'writer_safe', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const characterDirectives: readonly BehavioralCharacterDirective[] = arrayAt(
    item.characterDirectives, '$.characterDirectives',
  ).map((value, index) => {
    const path = `$.characterDirectives[${index}]`;
    const source = exactObject(value, path, ['characterId', 'directives']);
    return {
      characterId: stringAt(source.characterId, `${path}.characterId`),
      directives: cloneStrings(source.directives, `${path}.directives`),
    };
  });
  const establishedFacts = arrayAt(item.establishedFacts, '$.establishedFacts').map((value, index) =>
    writerFactAt(value, `$.establishedFacts[${index}]`),
  );
  const revealGuidance = arrayAt(item.revealGuidance, '$.revealGuidance').map((value, index) =>
    guidanceAt(value, `$.revealGuidance[${index}]`),
  );
  const acceptedProseContext: readonly AcceptedProseContext[] = arrayAt(
    item.acceptedProseContext, '$.acceptedProseContext',
  ).map((value, index) => {
    const path = `$.acceptedProseContext[${index}]`;
    const source = exactObject(value, path, ['proseVersionId', 'beatId', 'excerpt']);
    return {
      proseVersionId: stringAt(source.proseVersionId, `${path}.proseVersionId`),
      beatId: stringAt(source.beatId, `${path}.beatId`),
      excerpt: stringAt(source.excerpt, `${path}.excerpt`),
    };
  });
  assertUniqueIds(establishedFacts, '$.establishedFacts');
  return {
    kind: 'writer',
    dataClass: 'writer_safe',
    metadata: metadataAt(item.metadata),
    beatContract: beatContractAt(item.beatContract, '$.beatContract'),
    characterDirectives,
    establishedFacts,
    revealGuidance,
    acceptedProseContext,
  } as WriterContextPacket;
}
```

Tidak boleh mengganti return dengan `{ ...input }`, nested spread, `structuredClone(input)`, atau JSON round-trip.

Setelah kedua function ada, tambahkan ke akhir `packages/core/src/context/index.ts`:

```ts
export { buildPlannerPacket, buildWriterPacket } from './packet-builders.js';
```

Jangan mengekspor `buildValidatorPacket`, `buildRepairPacket`, atau `buildExtractionPacket` pada task ini karena belum diimplementasikan.

- [ ] **Step 7: Jalankan focused tests dan pastikan hijau**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context/packet-builders.test.ts src/context/writer-packet-leak.test.ts src/context/writer-guidance-safe.test.ts
pnpm --filter @narraza/core build
pnpm exec prettier --check packages/core/src/context
pnpm exec prettier --check packages/core/src/index.ts
git diff --check
```

Expected: seluruh test PASS; output mencakup suites `packet-builders`, `writer-packet-leak`, dan `writer-guidance-safe`; build dan Prettier exit `0`; `git diff --check` tanpa output.

- [ ] **Step 8: Commit planner/writer runtime boundary**

```bash
git add packages/core/src/context/index.ts packages/core/src/context/packet-builders.ts packages/core/src/context/packet-builders.test.ts packages/core/src/context/writer-packet-leak.test.ts packages/core/src/context/writer-guidance-safe.test.ts
git commit -m "feat(core): build leak-safe planner and writer packets"
```

## Task 4: Validator dan repair packets

**Files:**
- Modify: `packages/core/src/context/packet-builders.ts`
- Modify: `packages/core/src/context/index.ts`
- Modify: `packages/core/src/context/packet-builders.test.ts`
- Create: `packages/core/src/context/repair-packet.test.ts`

**Global Constraints:**
- Validator tetap `author_private`; repair tetap `writer_safe`; restricted/internal finding fields tidak boleh masuk repair.
- Nested validator contract wajib exact-key validated dan deep-cloned; hanya validator/repair builders yang selesai task ini ditambahkan ke barrel.

**Interfaces:**
- `ValidatorPacketInput.beatContract` memakai `ValidatorBeatContract`, bukan `WriterSafeBeatContract`, agar langsung kompatibel dengan W1.4 structural validator.
- `buildValidatorPacket` menyalin required IDs/fact keys, typed directives/actions, optional ending, optional length range, dan enam field `RestrictedGuard` W1.4 secara langsung; W1.4 dapat mengonsumsi output tanpa mapper atau transform tambahan. `buildRepairPacket` hanya menerima sanitized `RepairDirective`.

- [ ] **Step 1: Tulis validator tests merah**

Tambahkan imports `buildValidatorPacket` dan test berikut ke `packet-builders.test.ts`:

```ts
it('builds author-private validator packet and rejects mismatch', () => {
  const input = {
    kind: 'validator',
    dataClass: 'author_private',
    metadata,
    prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Mira closed the door.' },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Delay disclosure',
      requiredCharacterIds: ['character-1'],
      requiredFactKeys: ['door_locked'],
      requiredDirectives: [
        {
          directiveKey: 'keep-indirect',
          description: 'Keep the answer indirect',
          lexicalEvidence: ['not yet'],
        },
      ],
      prohibitedActions: [
        {
          actionKey: 'name-heir',
          description: 'Do not name the heir',
          lexicalEvidence: ['the heir is alive'],
        },
      ],
      endingRequirement: { description: 'End on doubt', lexicalEvidence: ['?'] },
      lengthRange: { min: 10, max: 500 },
    },
    restrictedGuardSets: [
      {
        guardKey: 'fact:heir-alive',
        prohibitedExact: ['The heir is alive'],
        prohibitedAliases: ['the lost prince'],
        coOccurrenceGroups: [['heir', 'alive']],
        proximityGroups: [['lost', 'prince']],
        semanticReviewRequired: true,
      },
    ],
    continuityRules: [
      {
        ruleKey: 'door-state',
        instruction: 'Door remains locked',
        restrictedEvidence: ['Mira hid the key'],
      },
    ],
  } as const;
  expect(buildValidatorPacket(input).dataClass).toBe('author_private');
  expect(() => buildValidatorPacket({ ...input, dataClass: 'writer_safe' } as never)).toThrowError(
    expect.objectContaining({ code: 'DATA_CLASS_MISMATCH' }),
  );

  const packet = buildValidatorPacket(input);
  expect(packet.beatContract).toEqual(input.beatContract);
  expect(packet.beatContract).not.toBe(input.beatContract);
  expect(packet.beatContract.requiredCharacterIds).not.toBe(
    input.beatContract.requiredCharacterIds,
  );
  expect(packet.beatContract.requiredDirectives[0]).not.toBe(
    input.beatContract.requiredDirectives[0],
  );
  expect(packet.beatContract.requiredDirectives[0]?.lexicalEvidence).not.toBe(
    input.beatContract.requiredDirectives[0]?.lexicalEvidence,
  );
  expect(packet.beatContract.prohibitedActions[0]).not.toBe(
    input.beatContract.prohibitedActions[0],
  );
  expect(packet.beatContract.endingRequirement).not.toBe(
    input.beatContract.endingRequirement,
  );
  expect(packet.beatContract.lengthRange).not.toBe(input.beatContract.lengthRange);
  expect(packet.restrictedGuardSets).toEqual(input.restrictedGuardSets);
  expect(packet.restrictedGuardSets).not.toBe(input.restrictedGuardSets);
  expect(packet.restrictedGuardSets[0]).not.toBe(input.restrictedGuardSets[0]);
  expect(packet.restrictedGuardSets[0]?.prohibitedExact).not.toBe(
    input.restrictedGuardSets[0]?.prohibitedExact,
  );
  expect(packet.restrictedGuardSets[0]?.coOccurrenceGroups).not.toBe(
    input.restrictedGuardSets[0]?.coOccurrenceGroups,
  );
  expect(packet.restrictedGuardSets[0]?.coOccurrenceGroups[0]).not.toBe(
    input.restrictedGuardSets[0]?.coOccurrenceGroups[0],
  );
  expect(packet.restrictedGuardSets[0]?.proximityGroups).not.toBe(
    input.restrictedGuardSets[0]?.proximityGroups,
  );
  expect(packet.restrictedGuardSets[0]?.proximityGroups[0]).not.toBe(
    input.restrictedGuardSets[0]?.proximityGroups[0],
  );

  const malformed = {
    ...input,
    beatContract: {
      ...input.beatContract,
      requiredDirectives: [
        { ...input.beatContract.requiredDirectives[0], truth: 'The heir is alive' },
      ],
    },
  };
  expect(() => buildValidatorPacket(malformed as never)).toThrowError(
    expect.objectContaining({
      code: 'UNKNOWN_KEY',
      path: '$.beatContract.requiredDirectives[0].truth',
    }),
  );


  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: { ...input.beatContract, requiredCharacterIds: ['character-1', 'character-1'] },
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));

  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: { ...input.beatContract, lengthRange: { min: 20, max: 10 } },
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));

  expect(() =>
    buildValidatorPacket({
      ...input,
      beatContract: {
        ...input.beatContract,
        endingRequirement: { ...input.beatContract.endingRequirement, truth: 'The heir is alive' },
      },
    } as never),
  ).toThrowError(
    expect.objectContaining({
      code: 'UNKNOWN_KEY',
      path: '$.beatContract.endingRequirement.truth',
    }),
  );
});

it.each([
  [
    'requiredDirectives',
    {
      directiveKey: 'keep-indirect',
      description: 'Keep the answer indirect',
    },
  ],
  [
    'prohibitedActions',
    {
      actionKey: 'name-heir',
      description: 'Do not name the heir',
    },
  ],
] as const)('rejects duplicate validator %s keys', (field, entry) => {
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
        [field]: [entry, entry],
      },
      restrictedGuardSets: [],
      continuityRules: [],
    } as never),
  ).toThrowError(
    expect.objectContaining({
      code: 'DUPLICATE_ENTITY_ID',
      path: `$.beatContract.${field}`,
    }),
  );
});

it.each([
  ['revealId', 'reveal-1'],
  ['sensitiveTerms', ['heir', 'alive']],
  ['targetPosition', { chapterId: 'chapter-8', sequence: 80 }],
])('rejects obsolete validator guard field %s', (key, value) => {
  const guard = {
    guardKey: 'fact:heir-alive',
    prohibitedExact: ['The heir is alive'],
    prohibitedAliases: ['the lost prince'],
    coOccurrenceGroups: [['heir', 'alive']],
    proximityGroups: [['lost', 'prince']],
    semanticReviewRequired: true,
    [key]: value,
  };
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
      },
      restrictedGuardSets: [guard],
      continuityRules: [],
    } as never),
  ).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY', path: `$.restrictedGuardSets[0].${key}` }),
  );
});

it.each([
  [{ guardKey: '' }, '$.restrictedGuardSets[0].guardKey'],
  [{ coOccurrenceGroups: [['only-one']] }, '$.restrictedGuardSets[0].coOccurrenceGroups[0]'],
  [{ proximityGroups: [['one', 2]] }, '$.restrictedGuardSets[0].proximityGroups[0][1]'],
  [{ semanticReviewRequired: 'yes' }, '$.restrictedGuardSets[0].semanticReviewRequired'],
])('rejects malformed W1.4 guard value %#', (override, path) => {
  const guard = {
    guardKey: 'fact:heir-alive',
    prohibitedExact: ['The heir is alive'],
    prohibitedAliases: ['the lost prince'],
    coOccurrenceGroups: [['heir', 'alive']],
    proximityGroups: [['lost', 'prince']],
    semanticReviewRequired: true,
    ...override,
  };
  expect(() =>
    buildValidatorPacket({
      kind: 'validator',
      dataClass: 'author_private',
      metadata,
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
      beatContract: {
        beatId: 'beat-1',
        purpose: 'Test',
        requiredCharacterIds: [],
        requiredFactKeys: [],
        requiredDirectives: [],
        prohibitedActions: [],
      },
      restrictedGuardSets: [guard],
      continuityRules: [],
    } as never),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET', path }));
});

it('does not allow validator packet conversion through writer builder', () => {
  const validator = {
    kind: 'validator',
    dataClass: 'author_private',
    metadata,
    prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
    beatContract: {
      beatId: 'beat-1',
      purpose: 'Test',
      requiredCharacterIds: [],
      requiredFactKeys: [],
      requiredDirectives: [],
      prohibitedActions: [],
    },
    restrictedGuardSets: [],
    continuityRules: [],
  } as const;
  expect(() => buildWriterPacket(buildValidatorPacket(validator) as never)).toThrowError(
    expect.objectContaining({ code: 'UNKNOWN_KEY' }),
  );
});
```

- [ ] **Step 2: Tulis repair-packet fixture merah**

Buat `repair-packet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildRepairPacket, type RepairPacketInput } from './index.js';

const safeRepair: RepairPacketInput = {
  kind: 'repair',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'd'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  repairableProse: {
    proseVersionId: 'prose-2',
    beatId: 'beat-1',
    content: 'Mira named the heir.',
  },
  directives: [
    {
      findingKey: 'finding-1',
      publicMessageCode: 'validation.reveal.too_early',
      instruction: 'Replace the explicit statement with a visible hesitation.',
      location: { startUtf16: 0, endUtf16: 20 },
    },
  ],
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Delay disclosure',
    sceneGoal: 'End on doubt',
    directives: ['Keep the answer indirect'],
  },
  revealGuidance: [
    { revealId: 'reveal-1', guidance: { status: 'hold', safeDirectives: ['Keep it indirect'] } },
  ],
};

describe('repair-packet', () => {
  it('builds only sanitized directives', () => {
    expect(buildRepairPacket(safeRepair).directives).toEqual(safeRepair.directives);
  });

  it.each([
    ['ruleKey', 'reveal.exact'],
    ['severity', 'blocking'],
    ['internalRationale', 'Matched the forbidden truth'],
    ['restrictedEvidence', ['The heir is alive']],
    ['forbiddenPhrase', 'The heir is alive'],
    ['truth', 'The heir is alive'],
  ])('rejects unsanitized directive field %s', (key, value) => {
    const directive = { ...safeRepair.directives[0], [key]: value };
    expect(() => buildRepairPacket({ ...safeRepair, directives: [directive] } as never)).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_KEY' }),
    );
  });

  it('rejects malformed UTF-16 location', () => {
    const directive = {
      ...safeRepair.directives[0],
      location: { startUtf16: 21, endUtf16: 20 },
    };
    expect(() => buildRepairPacket({ ...safeRepair, directives: [directive] } as never)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PACKET' }),
    );
  });
});
```

- [ ] **Step 3: Jalankan focused tests dan verifikasi merah**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context/packet-builders.test.ts src/context/repair-packet.test.ts
```

Expected: FAIL karena `buildValidatorPacket` dan `buildRepairPacket` belum diimplementasikan.

- [ ] **Step 4: Implementasikan validator helper dan builder**

Tambahkan ke `packet-builders.ts`:

```ts
function proseAt(value: unknown, path: string): ValidatorProse {
  const item = exactObject(value, path, ['proseVersionId', 'beatId', 'content']);
  return {
    proseVersionId: stringAt(item.proseVersionId, `${path}.proseVersionId`),
    beatId: stringAt(item.beatId, `${path}.beatId`),
    content: stringAt(item.content, `${path}.content`),
  };
}

function validatorDirectiveAt(value: unknown, path: string): ValidatorBeatDirective {
  const source = objectAt(value, path);
  const hasLexicalEvidence = Object.hasOwn(source, 'lexicalEvidence');
  const item = exactObject(
    value,
    path,
    hasLexicalEvidence
      ? ['directiveKey', 'description', 'lexicalEvidence']
      : ['directiveKey', 'description'],
  );
  const directive = {
    directiveKey: stringAt(item.directiveKey, `${path}.directiveKey`),
    description: stringAt(item.description, `${path}.description`),
  };
  return hasLexicalEvidence
    ? {
        ...directive,
        lexicalEvidence: cloneStrings(item.lexicalEvidence, `${path}.lexicalEvidence`),
      }
    : directive;
}

function prohibitedActionAt(value: unknown, path: string): ValidatorProhibitedAction {
  const source = objectAt(value, path);
  const hasLexicalEvidence = Object.hasOwn(source, 'lexicalEvidence');
  const item = exactObject(
    value,
    path,
    hasLexicalEvidence
      ? ['actionKey', 'description', 'lexicalEvidence']
      : ['actionKey', 'description'],
  );
  const action = {
    actionKey: stringAt(item.actionKey, `${path}.actionKey`),
    description: stringAt(item.description, `${path}.description`),
  };
  return hasLexicalEvidence
    ? {
        ...action,
        lexicalEvidence: cloneStrings(item.lexicalEvidence, `${path}.lexicalEvidence`),
      }
    : action;
}

function validatorBeatContractAt(value: unknown, path: string): ValidatorBeatContract {
  const source = objectAt(value, path);
  const hasEndingRequirement = Object.hasOwn(source, 'endingRequirement');
  const hasLengthRange = Object.hasOwn(source, 'lengthRange');
  const item = exactObject(value, path, [
    'beatId',
    'purpose',
    'requiredCharacterIds',
    'requiredFactKeys',
    'requiredDirectives',
    'prohibitedActions',
    ...(hasEndingRequirement ? ['endingRequirement'] : []),
    ...(hasLengthRange ? ['lengthRange'] : []),
  ]);
  const requiredDirectives = arrayAt(
    item.requiredDirectives,
    `${path}.requiredDirectives`,
  ).map((value, index) =>
    validatorDirectiveAt(value, `${path}.requiredDirectives[${index}]`),
  );
  const prohibitedActions = arrayAt(item.prohibitedActions, `${path}.prohibitedActions`).map(
    (value, index) => prohibitedActionAt(value, `${path}.prohibitedActions[${index}]`),
  );
  const directiveKeys = requiredDirectives.map((directive) => directive.directiveKey);
  if (new Set(directiveKeys).size !== directiveKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      `${path}.requiredDirectives`,
      `${path}.requiredDirectives contains duplicate directiveKey values`,
    );
  }
  const actionKeys = prohibitedActions.map((action) => action.actionKey);
  if (new Set(actionKeys).size !== actionKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      `${path}.prohibitedActions`,
      `${path}.prohibitedActions contains duplicate actionKey values`,
    );
  }
  const contract = {
    beatId: stringAt(item.beatId, `${path}.beatId`),
    purpose: stringAt(item.purpose, `${path}.purpose`),
    requiredCharacterIds: uniqueStringsAt(
      item.requiredCharacterIds,
      `${path}.requiredCharacterIds`,
    ),
    requiredFactKeys: uniqueStringsAt(item.requiredFactKeys, `${path}.requiredFactKeys`),
    requiredDirectives,
    prohibitedActions,
  };
  let endingRequirement: ValidatorEndingRequirement | undefined;
  if (hasEndingRequirement) {
    const endingSource = objectAt(item.endingRequirement, `${path}.endingRequirement`);
    const hasLexicalEvidence = Object.hasOwn(endingSource, 'lexicalEvidence');
    const ending = exactObject(
      endingSource,
      `${path}.endingRequirement`,
      hasLexicalEvidence ? ['description', 'lexicalEvidence'] : ['description'],
    );
    const endingBase = {
      description: stringAt(ending.description, `${path}.endingRequirement.description`),
    };
    endingRequirement = hasLexicalEvidence
      ? {
          ...endingBase,
          lexicalEvidence: cloneStrings(
            ending.lexicalEvidence,
            `${path}.endingRequirement.lexicalEvidence`,
          ),
        }
      : endingBase;
  }
  let lengthRange: ValidatorLengthRange | undefined;
  if (hasLengthRange) {
    const range = exactObject(item.lengthRange, `${path}.lengthRange`, ['min', 'max']);
    if (
      !Number.isSafeInteger(range.min) ||
      !Number.isSafeInteger(range.max) ||
      (range.min as number) < 0 ||
      (range.max as number) < (range.min as number)
    ) {
      fail(
        'INVALID_PACKET',
        `${path}.lengthRange`,
        'length range must satisfy 0 <= min <= max',
      );
    }
    lengthRange = { min: range.min as number, max: range.max as number };
  }
  return {
    ...contract,
    ...(endingRequirement === undefined ? {} : { endingRequirement }),
    ...(lengthRange === undefined ? {} : { lengthRange }),
  };
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('INVALID_PACKET', path, `${path} must be a boolean`);
  return value;
}

function termGroupsAt(value: unknown, path: string): readonly (readonly string[])[] {
  return arrayAt(value, path).map((group, index) => {
    const groupPath = `${path}[${index}]`;
    const terms = cloneStrings(group, groupPath);
    if (terms.length < 2) {
      fail('INVALID_PACKET', groupPath, `${groupPath} must contain at least two terms`);
    }
    return terms;
  });
}

function guardAt(value: unknown, path: string): RestrictedGuard {
  const item = exactObject(value, path, [
    'guardKey',
    'prohibitedExact',
    'prohibitedAliases',
    'coOccurrenceGroups',
    'proximityGroups',
    'semanticReviewRequired',
  ]);
  return {
    guardKey: stringAt(item.guardKey, `${path}.guardKey`),
    prohibitedExact: cloneStrings(item.prohibitedExact, `${path}.prohibitedExact`),
    prohibitedAliases: cloneStrings(item.prohibitedAliases, `${path}.prohibitedAliases`),
    coOccurrenceGroups: termGroupsAt(item.coOccurrenceGroups, `${path}.coOccurrenceGroups`),
    proximityGroups: termGroupsAt(item.proximityGroups, `${path}.proximityGroups`),
    semanticReviewRequired: booleanAt(
      item.semanticReviewRequired,
      `${path}.semanticReviewRequired`,
    ),
  };
}

export function buildValidatorPacket(input: ValidatorPacketInput): ValidatorContextPacket {
  const item = exactObject(input, '$', [
    'kind', 'dataClass', 'metadata', 'prose', 'beatContract', 'restrictedGuardSets', 'continuityRules',
  ]);
  literalAt(item.kind, 'validator', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'author_private', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const restrictedGuardSets = arrayAt(item.restrictedGuardSets, '$.restrictedGuardSets').map((value, index) =>
    guardAt(value, `$.restrictedGuardSets[${index}]`),
  );
  const guardKeys = restrictedGuardSets.map((guard) => guard.guardKey);
  if (new Set(guardKeys).size !== guardKeys.length) {
    fail(
      'DUPLICATE_ENTITY_ID',
      '$.restrictedGuardSets',
      '$.restrictedGuardSets contains duplicate guardKey values',
    );
  }
  const continuityRules = arrayAt(item.continuityRules, '$.continuityRules').map((value, index) => {
    const path = `$.continuityRules[${index}]`;
    const source = exactObject(value, path, ['ruleKey', 'instruction', 'restrictedEvidence']);
    return {
      ruleKey: stringAt(source.ruleKey, `${path}.ruleKey`),
      instruction: stringAt(source.instruction, `${path}.instruction`),
      restrictedEvidence: cloneStrings(source.restrictedEvidence, `${path}.restrictedEvidence`),
    };
  });
  return {
    kind: 'validator',
    dataClass: 'author_private',
    metadata: metadataAt(item.metadata),
    prose: proseAt(item.prose, '$.prose'),
    beatContract: validatorBeatContractAt(item.beatContract, '$.beatContract'),
    restrictedGuardSets,
    continuityRules,
  } as ValidatorContextPacket;
}
```

- [ ] **Step 5: Implementasikan sanitized repair builder**

Tambahkan ke `packet-builders.ts`:

```ts
function locationAt(value: unknown, path: string): FindingLocationInput {
  const item = exactObject(value, path, ['startUtf16', 'endUtf16']);
  if (!Number.isSafeInteger(item.startUtf16) || !Number.isSafeInteger(item.endUtf16)) {
    fail('INVALID_PACKET', path, 'location offsets must be safe integers');
  }
  const startUtf16 = item.startUtf16 as number;
  const endUtf16 = item.endUtf16 as number;
  if (startUtf16 < 0 || endUtf16 < startUtf16) {
    fail('INVALID_PACKET', path, 'location must satisfy 0 <= startUtf16 <= endUtf16');
  }
  return { startUtf16, endUtf16 };
}

function repairDirectiveAt(value: unknown, path: string): RepairDirective {
  const source = objectAt(value, path);
  const hasLocation = Object.hasOwn(source, 'location');
  const item = exactObject(
    value,
    path,
    hasLocation
      ? ['findingKey', 'publicMessageCode', 'instruction', 'location']
      : ['findingKey', 'publicMessageCode', 'instruction'],
  );
  const base = {
    findingKey: stringAt(item.findingKey, `${path}.findingKey`),
    publicMessageCode: stringAt(item.publicMessageCode, `${path}.publicMessageCode`),
    instruction: stringAt(item.instruction, `${path}.instruction`),
  };
  return hasLocation ? { ...base, location: locationAt(item.location, `${path}.location`) } : base;
}

export function buildRepairPacket(input: RepairPacketInput): RepairContextPacket {
  const item = exactObject(input, '$', [
    'kind', 'dataClass', 'metadata', 'repairableProse', 'directives', 'beatContract', 'revealGuidance',
  ]);
  literalAt(item.kind, 'repair', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, 'writer_safe', '$.dataClass', 'DATA_CLASS_MISMATCH');
  const repairableProseSource = exactObject(item.repairableProse, '$.repairableProse', [
    'proseVersionId', 'beatId', 'content',
  ]);
  const repairableProse: RepairableProse = {
    proseVersionId: stringAt(repairableProseSource.proseVersionId, '$.repairableProse.proseVersionId'),
    beatId: stringAt(repairableProseSource.beatId, '$.repairableProse.beatId'),
    content: stringAt(repairableProseSource.content, '$.repairableProse.content'),
  };
  const directives = arrayAt(item.directives, '$.directives').map((value, index) =>
    repairDirectiveAt(value, `$.directives[${index}]`),
  );
  const revealGuidance = arrayAt(item.revealGuidance, '$.revealGuidance').map((value, index) =>
    guidanceAt(value, `$.revealGuidance[${index}]`),
  );
  return {
    kind: 'repair',
    dataClass: 'writer_safe',
    metadata: metadataAt(item.metadata),
    repairableProse,
    directives,
    beatContract: beatContractAt(item.beatContract, '$.beatContract'),
    revealGuidance,
  } as RepairContextPacket;
}
```

Object spread pada local `base` aman karena `base` dibuat builder dari tiga field allowlist; larangan hanya spread source aggregate/input.

Setelah kedua builder task ini ada, ubah export builder pada `packages/core/src/context/index.ts` menjadi:

```ts
export {
  buildPlannerPacket,
  buildRepairPacket,
  buildValidatorPacket,
  buildWriterPacket,
} from './packet-builders.js';
```

`buildExtractionPacket` tetap belum diekspor karena belum diimplementasikan.

- [ ] **Step 6: Jalankan validator/repair tests dan pastikan hijau**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context/packet-builders.test.ts src/context/repair-packet.test.ts
pnpm --filter @narraza/core build
pnpm exec prettier --check packages/core/src/context packages/core/src/index.ts
git diff --check
```

Expected: seluruh test PASS; duplicate `requiredDirectives.directiveKey` dan `prohibitedActions.actionKey` menghasilkan `DUPLICATE_ENTITY_ID`; unsanitized finding fields dan obsolete `revealId`/`sensitiveTerms`/`targetPosition` guard fields menghasilkan `UNKNOWN_KEY`; nested W1.4 guard arrays merupakan fresh clones; validator-to-writer conversion ditolak; build dan formatting exit `0`; `git diff --check` tanpa output.

- [ ] **Step 7: Commit validator/repair boundary**

```bash
git add packages/core/src/context/index.ts packages/core/src/context/packet-builders.ts packages/core/src/context/packet-builders.test.ts packages/core/src/context/repair-packet.test.ts
git commit -m "feat(core): add validator and sanitized repair packets"
```

## Task 5: Fixed extraction modes

**Files:**
- Modify: `packages/core/src/context/packet-builders.ts`
- Modify: `packages/core/src/context/index.ts`
- Create: `packages/core/src/context/extraction-packet.test.ts`

**Global Constraints:**
- Extraction use case/data class mapping fixed; custom use case, payload generic, mismatch class, unknown nested keys, dan duplicate IDs ditolak.
- `buildExtractionPacket` baru diekspor setelah ketiga mode diimplementasikan.

**Interfaces:**
- `intake_signals` dan `prose_public_structure` menghasilkan `review_safe`.
- `canon_reconciliation` menghasilkan `author_private`; ketiga mode mengembalikan `ExtractionContextPacket` dengan fresh allowlisted fields.

- [ ] **Step 1: Tulis extraction matrix tests merah**

Buat `extraction-packet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildExtractionPacket } from './index.js';

const metadata = {
  schemaVersion: 1,
  projectId: 'project-1',
  dependencyHash: 'e'.repeat(64),
  policyVersion: 'domain-core/v1',
} as const;

describe('extraction-packet', () => {
  it('maps intake_signals to review_safe', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata,
      useCase: 'intake_signals',
      messages: [{ id: 'message-1', role: 'user', content: 'I want a family mystery.' }],
    });
    expect(packet).toMatchObject({ useCase: 'intake_signals', dataClass: 'review_safe' });
  });

  it('maps prose_public_structure to review_safe', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata,
      useCase: 'prose_public_structure',
      prose: { proseVersionId: 'prose-1', content: 'Mira closed the door.' },
    });
    expect(packet).toMatchObject({ useCase: 'prose_public_structure', dataClass: 'review_safe' });
  });

  it('maps canon_reconciliation to author_private', () => {
    const packet = buildExtractionPacket({
      kind: 'extraction',
      dataClass: 'author_private',
      metadata,
      useCase: 'canon_reconciliation',
      prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Mira named the heir.' },
      facts: [
        {
          dataClass: 'author_private',
          id: 'fact-1',
          factKey: 'heir_alive',
          truth: 'The heir is alive',
          visibility: 'canonical',
        },
      ],
      characters: [{ id: 'character-1', identity: 'Mira is the archivist' }],
    });
    expect(packet).toMatchObject({ useCase: 'canon_reconciliation', dataClass: 'author_private' });
  });

  it.each([
    ['intake_signals', 'author_private'],
    ['prose_public_structure', 'author_private'],
    ['canon_reconciliation', 'review_safe'],
    ['canon_reconciliation', 'writer_safe'],
  ] as const)('rejects %s with %s', (useCase, dataClass) => {
    const base = { kind: 'extraction', metadata, useCase, dataClass };
    const payload =
      useCase === 'intake_signals'
        ? { messages: [] }
        : useCase === 'prose_public_structure'
          ? { prose: { proseVersionId: 'prose-1', content: 'Text' } }
          : {
              prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
              facts: [],
              characters: [],
            };
    expect(() => buildExtractionPacket({ ...base, ...payload } as never)).toThrowError(
      expect.objectContaining({ code: 'DATA_CLASS_MISMATCH' }),
    );
  });

  it('rejects custom extraction use case', () => {
    expect(() =>
      buildExtractionPacket({
        kind: 'extraction',
        dataClass: 'review_safe',
        metadata,
        useCase: 'custom',
        payload: {},
      } as never),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_PACKET' }));
  });

  it('rejects duplicate canon reconciliation IDs', () => {
    const fact = {
      dataClass: 'author_private',
      id: 'fact-1',
      factKey: 'heir_alive',
      truth: 'The heir is alive',
      visibility: 'canonical',
    } as const;
    expect(() =>
      buildExtractionPacket({
        kind: 'extraction',
        dataClass: 'author_private',
        metadata,
        useCase: 'canon_reconciliation',
        prose: { proseVersionId: 'prose-1', beatId: 'beat-1', content: 'Text' },
        facts: [fact, fact],
        characters: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ENTITY_ID' }));
  });
});
```

- [ ] **Step 2: Jalankan extraction tests dan verifikasi merah**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context/extraction-packet.test.ts
```

Expected: FAIL karena `buildExtractionPacket` belum diimplementasikan.

- [ ] **Step 3: Implementasikan fixed extraction switch**

Tambahkan ke `packet-builders.ts`:

```ts
function assertExtractionBase(item: Record<string, unknown>, expectedClass: 'review_safe' | 'author_private'): PacketMetadata {
  literalAt(item.kind, 'extraction', '$.kind', 'PACKET_KIND_MISMATCH');
  literalAt(item.dataClass, expectedClass, '$.dataClass', 'DATA_CLASS_MISMATCH');
  return metadataAt(item.metadata);
}

export function buildExtractionPacket(input: ExtractionPacketInput): ExtractionContextPacket {
  const raw = objectAt(input, '$');
  if (raw.useCase === 'intake_signals') {
    const item = exactObject(raw, '$', ['kind', 'dataClass', 'metadata', 'useCase', 'messages']);
    const messages: readonly IntakeSignalMessage[] = arrayAt(item.messages, '$.messages').map((value, index) => {
      const path = `$.messages[${index}]`;
      const source = exactObject(value, path, ['id', 'role', 'content']);
      if (source.role !== 'user' && source.role !== 'assistant') {
        fail('INVALID_PACKET', `${path}.role`, 'message role must be user or assistant');
      }
      return {
        id: stringAt(source.id, `${path}.id`),
        role: source.role,
        content: stringAt(source.content, `${path}.content`),
      };
    });
    assertUniqueIds(messages, '$.messages');
    return {
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: assertExtractionBase(item, 'review_safe'),
      useCase: 'intake_signals',
      messages,
    } as ExtractionContextPacket;
  }
  if (raw.useCase === 'prose_public_structure') {
    const item = exactObject(raw, '$', ['kind', 'dataClass', 'metadata', 'useCase', 'prose']);
    const source = exactObject(item.prose, '$.prose', ['proseVersionId', 'content']);
    const prose: PublicStructureProse = {
      proseVersionId: stringAt(source.proseVersionId, '$.prose.proseVersionId'),
      content: stringAt(source.content, '$.prose.content'),
    };
    return {
      kind: 'extraction',
      dataClass: 'review_safe',
      metadata: assertExtractionBase(item, 'review_safe'),
      useCase: 'prose_public_structure',
      prose,
    } as ExtractionContextPacket;
  }
  if (raw.useCase === 'canon_reconciliation') {
    const item = exactObject(raw, '$', [
      'kind', 'dataClass', 'metadata', 'useCase', 'prose', 'facts', 'characters',
    ]);
    const facts: readonly AuthorPrivateFact[] = arrayAt(item.facts, '$.facts').map((value, index) => {
      const path = `$.facts[${index}]`;
      const source = exactObject(value, path, ['dataClass', 'id', 'factKey', 'truth', 'visibility']);
      literalAt(source.dataClass, 'author_private', `${path}.dataClass`, 'DATA_CLASS_MISMATCH');
      if (source.visibility !== 'canonical' && source.visibility !== 'planner_only') {
        fail('INVALID_PACKET', `${path}.visibility`, 'unsupported fact visibility');
      }
      return {
        dataClass: 'author_private',
        id: stringAt(source.id, `${path}.id`),
        factKey: stringAt(source.factKey, `${path}.factKey`),
        truth: stringAt(source.truth, `${path}.truth`),
        visibility: source.visibility,
      };
    });
    const characters = arrayAt(item.characters, '$.characters').map((value, index) => {
      const path = `$.characters[${index}]`;
      const source = exactObject(value, path, ['id', 'identity']);
      return {
        id: stringAt(source.id, `${path}.id`),
        identity: stringAt(source.identity, `${path}.identity`),
      };
    });
    assertUniqueIds(facts, '$.facts');
    assertUniqueIds(characters, '$.characters');
    return {
      kind: 'extraction',
      dataClass: 'author_private',
      metadata: assertExtractionBase(item, 'author_private'),
      useCase: 'canon_reconciliation',
      prose: proseAt(item.prose, '$.prose'),
      facts,
      characters,
    } as ExtractionContextPacket;
  }
  fail('INVALID_PACKET', '$.useCase', 'unsupported extraction use case');
}
```

Switch tertutup ini satu-satunya mapping extraction. Jangan menerima caller-supplied custom use case, custom payload, atau generic data class.

Setelah `buildExtractionPacket` ada, ganti export builder pada `packages/core/src/context/index.ts` dengan barrel final:

```ts
export {
  buildExtractionPacket,
  buildPlannerPacket,
  buildRepairPacket,
  buildValidatorPacket,
  buildWriterPacket,
} from './packet-builders.js';
```

- [ ] **Step 4: Jalankan extraction dan full context tests**

Run:

```bash
pnpm --filter @narraza/core exec vitest run src/context
pnpm --filter @narraza/core build
pnpm exec prettier --check packages/core/src/context packages/core/src/index.ts
git diff --check
```

Expected: semua context runtime tests PASS, termasuk tiga extraction modes dan seluruh mismatch cases; build dan formatting exit `0`; `git diff --check` tanpa output.

- [ ] **Step 5: Commit extraction modes**

```bash
git add packages/core/src/context/index.ts packages/core/src/context/packet-builders.ts packages/core/src/context/extraction-packet.test.ts
git commit -m "feat(core): add fixed extraction packet modes"
```

## Task 6: Compile-time boundary, public API, dan full verification

**Files:**
- Create: `packages/core/src/context/packet-type-boundary.typecheck.ts`
- Create: `packages/core/tsconfig.type-tests.json`
- Modify: `packages/core/tsconfig.json`
- Modify: `packages/core/package.json`
- Modify only if verification exposes defects: other files listed in File Map

**Global Constraints:**
- Type fixture/config/script wiring baru dipasang setelah kelima builder ada, sehingga commit sebelumnya selalu buildable dan testable.
- `packet-type-boundary.typecheck.ts` wajib dikeluarkan dari production `tsconfig.json`; hanya dedicated `tsconfig.type-tests.json` yang compile fixture tersebut.
- Tidak mengubah dependency, lockfile, generated `dist`, progress checklist, DB, app, AI, atau framework code.

**Interfaces:**
- Final context barrel mengekspor tepat lima named builders plus listed public types/constants/error; root hanya mengekspor namespace `context`.
- `test:unit` menjalankan Vitest lalu `test:types`; dedicated type config compile source context dan fixture tanpa emit.

- [ ] **Step 1: Buat final compile-time fixture setelah semua builder tersedia**

Buat `packages/core/src/context/packet-type-boundary.typecheck.ts`:

```ts
import {
  buildRepairPacket,
  buildWriterPacket,
  type AuthorPrivateFact,
  type PlannerPacketInput,
  type RepairDirective,
  type WriterPacketInput,
  type WriterSafeFact,
} from './index.js';

declare const privateFact: AuthorPrivateFact;
interface InternalValidationFindingFixture {
  readonly findingKey: string;
  readonly ruleKey: string;
  readonly severity: 'info' | 'warning' | 'error' | 'blocking';
  readonly publicMessageCode: string;
  readonly internalRationale: string;
  readonly restrictedEvidence: readonly string[];
}

declare const internalFinding: InternalValidationFindingFixture;
declare const plannerInput: PlannerPacketInput;

// @ts-expect-error author-private fact is not writer-safe fact
const writerFact: WriterSafeFact = privateFact;

// @ts-expect-error internal finding is not sanitized repair directive
const repairDirective: RepairDirective = internalFinding;

// @ts-expect-error planner input cannot enter writer builder
buildWriterPacket(plannerInput);

const writerInput: WriterPacketInput = {
  kind: 'writer',
  dataClass: 'writer_safe',
  metadata: {
    schemaVersion: 1,
    projectId: 'project-1',
    dependencyHash: 'a'.repeat(64),
    policyVersion: 'domain-core/v1',
  },
  beatContract: {
    beatId: 'beat-1',
    purpose: 'Force a choice',
    sceneGoal: 'Mira refuses the offer',
    directives: ['Show hesitation through action'],
  },
  characterDirectives: [],
  establishedFacts: [],
  revealGuidance: [],
  acceptedProseContext: [],
};

buildWriterPacket(writerInput);

// @ts-expect-error writer input cannot enter repair builder
buildRepairPacket(writerInput);

void writerFact;
void repairDirective;
```

Shape adversarial internal finding tetap lokal di fixture dan tidak menjadi production export.

- [ ] **Step 2: Buat dedicated type-test config**

Buat `packages/core/tsconfig.type-tests.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "noEmit": true,
    "rootDir": "./src"
  },
  "include": ["src/context/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/context/**/*.test.ts"]
}
```

Fixture `*.typecheck.ts` masuk dedicated config karena tidak cocok exclusion runtime `*.test.ts`.

- [ ] **Step 3: Keluarkan type fixture dari production build**

Ubah `packages/core/tsconfig.json` menjadi:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.typecheck.ts"]
}
```

Production `tsc -b` tidak emit `packet-type-boundary.typecheck.js` atau `.d.ts`. Dedicated config tetap compile fixture langsung.

- [ ] **Step 4: Wire final type test ke package scripts**

Ubah scripts `packages/core/package.json` menjadi:

```json
"scripts": {
  "build": "tsc -b",
  "test": "pnpm run test:unit",
  "test:unit": "vitest run --passWithNoTests && pnpm run test:types",
  "test:types": "tsc -p tsconfig.type-tests.json",
  "clean": "rimraf dist *.tsbuildinfo"
}
```

Jangan menambah dependency.

- [ ] **Step 5: Format harness dan jalankan commit-boundary gates**

```bash
pnpm exec prettier --write packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.type-tests.json packages/core/src/context/packet-type-boundary.typecheck.ts >/dev/null
pnpm exec prettier --check packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.type-tests.json packages/core/src/context/packet-type-boundary.typecheck.ts
pnpm --filter @narraza/core test:types
pnpm --filter @narraza/core test:unit
pnpm --filter @narraza/core clean
pnpm --filter @narraza/core build
test ! -e packages/core/dist/context/packet-type-boundary.typecheck.js
test ! -e packages/core/dist/context/packet-type-boundary.typecheck.d.ts
git diff --check
```

Expected: seluruh command exit `0`; semua `@ts-expect-error` terpakai; runtime dan type tests PASS; production build hijau; production `dist` tidak memuat fixture; `git diff --check` tanpa output.

- [ ] **Step 6: Commit compile-time boundary harness**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.type-tests.json packages/core/src/context/packet-type-boundary.typecheck.ts
git commit -m "test(core): enforce context packet type boundaries"
```

Expected: commit berhasil dan green. Tidak ada task commit yang menyimpan failing fixture atau script yang merujuk export belum tersedia.

- [ ] **Step 7: Verifikasi declaration/public exports dan exact W1.4 guard contract**

```bash
pnpm --filter @narraza/core clean
pnpm --filter @narraza/core build
grep -R "writerSafeProjectionBrand\|restrictedProjectionBrand" packages/core/dist/context/packet-types.d.ts
grep -R "buildPacket" packages/core/src/context packages/core/dist/context || true
grep -nE "guardKey|prohibitedExact|prohibitedAliases|coOccurrenceGroups|proximityGroups|semanticReviewRequired" packages/core/src/context/packet-types.ts packages/core/src/context/packet-builders.ts
grep -nE "revealId|sensitiveTerms|targetPosition" packages/core/src/context/packet-types.ts packages/core/src/context/packet-builders.ts
```

Expected: build exit `0`; brand declarations internal dan tidak memiliki `export`; pencarian `buildPacket` tidak menghasilkan generic function. Enam W1.4 `RestrictedGuard` fields muncul pada type, allowlist, clone, dan tests. `revealId`/`targetPosition` hanya muncul pada planner reveal atau writer guidance yang terpisah, bukan validator guard; `sensitiveTerms` tidak muncul pada validator guard.

- [ ] **Step 8: Jalankan root quality gates**

Run satu per satu:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm format:check
pnpm arch
```

Expected: semua exit `0`; Unit Tests menjalankan runtime dan compile-time W1.3; Architecture Boundaries melaporkan `0 dependency violations`.

- [ ] **Step 9: Jalankan deterministic repeat, placeholder, diff, dan scope checks**

```bash
pnpm --filter @narraza/core test:unit
pnpm --filter @narraza/core test:unit
grep -RniE "TBD|TODO|FIXME|placeholder|implement later" packages/core/src/context packages/core/tsconfig.type-tests.json || true
git diff --check
git diff --name-only master...HEAD
git status --short
```

Expected: dua run menghasilkan test count/status sama; placeholder scan dan `git diff --check` tanpa output; diff name list hanya paths pada File Map; working tree bersih. Generated `packages/core/dist/**` tidak di-commit bila ignored.

- [ ] **Step 10: Commit verification fix hanya bila gate mengubah allowed file**

Bila gate menemukan defect, perbaiki hanya file pada File Map, lalu jalankan ulang focused test, `pnpm --filter @narraza/core build`, Prettier check, dan `git diff --check` sebelum commit:

```bash
git add docs/verification-matrix.md packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.type-tests.json packages/core/src/index.ts packages/core/src/context
git commit -m "test(core): complete context packet verification"
```

Expected: commit hanya dibuat bila ada perubahan nyata dan seluruh gates sudah hijau. Jangan membuat empty commit.

- [ ] **Step 11: Final branch audit**

```bash
git status --short
git log --oneline --decorate master..HEAD
```

Expected: working tree bersih. Log memuat commits kecil berikut, dengan final verification commit hanya bila diperlukan:

```text
docs: register W1.3 packet invariants
feat(core): define context packet type model
feat(core): build leak-safe planner and writer packets
feat(core): add validator and sanitized repair packets
feat(core): add fixed extraction packet modes
test(core): enforce context packet type boundaries
test(core): complete context packet verification
```

## Acceptance checklist W1.3

- [ ] `ContextPacket` union mencakup tepat planner, writer, validator, repair, extraction.
- [ ] Planner memakai `author_private`; membawa foundation, characters, facts termasuk `planner_only`, reveals, future outline; tidak memiliki service/security/provider fields.
- [ ] Writer memakai `writer_safe`; membawa safe beat contract, behavioral directives, established safe facts, writer reveal guidance, accepted safe prose context.
- [ ] Writer secara type dan runtime tidak memiliki truth, raw beliefs, restricted aliases/guards, future outline, planner-only facts, unrevealed payload, atau author-private wrapper.
- [ ] Validator memakai `author_private`; membawa prose, W1.4-compatible strict validator beat contract (`requiredCharacterIds`, `requiredFactKeys`, typed directives/actions, optional ending/length), exact W1.4 `RestrictedGuard` objects (`guardKey`, `prohibitedExact`, `prohibitedAliases`, `coOccurrenceGroups`, `proximityGroups`, `semanticReviewRequired`), dan continuity rules; nested values tervalidasi/di-clone dan dapat dikonsumsi W1.4 tanpa mapper; packet tidak dapat masuk writer builder.
- [ ] Repair memakai `writer_safe`; membawa repairable prose, sanitized directives, safe beat contract, writer guidance; internal finding utuh dan restricted rationale/evidence ditolak.
- [ ] Extraction hanya `intake_signals`/`prose_public_structure` sebagai `review_safe` dan `canon_reconciliation` sebagai `author_private`; custom use case dan mismatch ditolak.
- [ ] `service_restricted` tidak masuk packet mana pun.
- [ ] Metadata schema version `1`, policy version `domain-core/v1`, non-empty project ID, lowercase SHA-256 dependency hash tervalidasi.
- [ ] Barrel disusun per task tanpa re-export builder yang belum ada; final barrel menyediakan lima public builder dan tidak menyediakan generic `buildPacket`.
- [ ] Builder memakai exact field allowlist, membuat nested object/array baru, dan menolak unknown packet-owned key; reveal guidance raw boundary menerima tepat `status`/`safeDirectives` serta menolak `truth`/`prohibitedExact`.
- [ ] Duplicate entity IDs, validator directive/action keys, dan unresolved planner reveal fact ditolak typed error.
- [ ] Internal `unique symbol` brands membedakan writer-safe dan restricted packet outputs; brands bukan pengganti runtime validation.
- [ ] `writer-packet-leak`, `writer-guidance-safe`, packet builder, repair, extraction, dan compile-time boundary tests hijau.
- [ ] Tidak ada dependency baru, DB/network test, Prisma import, application orchestration, AI prompt/provider, UI, DTO client, atau perubahan progress checklist.
