# W1.5 Operation Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun pipeline domain murni yang mengubah suggestion model strict menjadi 15 operasi canonical terurut dan ter-hash, dengan writer-safe enforcement, evidence binding, tempRef resolution, snapshot validation, DAG stabil, dan repair re-extraction fail-closed.

**Architecture:** `packages/core/src/operations` mempunyai tiga boundary: parser hanya menerima bentuk model-safe exact-key, normalizer membentuk reference/payload domain bernama canonical, dan resolver internal menjadi satu-satunya pembuat branded `CanonicalChangeOperation`. Catalog mengunci allowlist/risk/target mode; resolver memvalidasi snapshot, mengalokasikan ID, membangun dependency DAG, stable-toposort, memberi ordinal, lalu memakai `sha256Hex(prefix + canonicalJson(material))` dari W1.2.

**Tech Stack:** TypeScript 5.9 strict ESM, dedicated `tsc` type-test project, Vitest 4.1, W1.2 `canonicalJson`/`sha256Hex`, pnpm 11.

---

## Prasyarat dan global constraints

- W1.4 sudah merge ke `master`; branch implementasi: `feat/m1-operation-layers`.
- Core tetap pure: tanpa DB, Prisma, HTTP, Next.js, React, AI provider, randomness, clock, locale collation, atau dependency baru.
- Semua import selama Task 2–9 langsung ke file module. `operations/index.ts` dan root barrel baru dibuat Task 10, sehingga setiap green task mempunyai import yang sudah ada.
- Semua object pada runtime boundary harus plain, dense, exact-key, dan dibangun ulang tanpa spread dari input model.
- Semua string domain non-empty setelah trim; `tempRef` cocok `^[A-Za-z][A-Za-z0-9_-]{0,63}$`; SHA-256 lowercase 64 hex; integer harus safe dan non-negatif.
- Semua output collection `readonly`; error fail-closed memakai `OperationDomainError`.
- Setiap task selesai dengan focused tests, `pnpm --filter @narraza/core run test:type:operations`, build bila konfigurasi production sudah disentuh, lalu green commit.

Run baseline:

```bash
git checkout master
git pull --ff-only origin master
git checkout -b feat/m1-operation-layers
pnpm --filter @narraza/core test:unit
pnpm --filter @narraza/core build
```

Expected: test/build W1.2–W1.4 exit 0; branch aktif `feat/m1-operation-layers`.

## File map

| Path | Action | Responsibility |
|---|---|---|
| `docs/verification-matrix.md` | Modify | Register stable DAG/cycle and canonical operations hash/permutation invariants before tests. |
| `packages/core/package.json` | Modify | Dedicated operation type-test command. |
| `packages/core/tsconfig.operations-type-tests.json` | Create | Compile-time boundary project, `noEmit`, isolated from production build. |
| `packages/core/type-tests/op-type-boundary.type-test.ts` | Create | `@ts-expect-error` assertions for three non-assignable layers. |
| `packages/core/src/operations/errors.ts` | Create | Typed W1.5 errors. |
| `packages/core/src/operations/entities.ts` | Create | Entity/reference/snapshot/context contracts and strict guards. |
| `packages/core/src/operations/payloads.ts` | Create | Complete normalized/canonical payload unions. |
| `packages/core/src/operations/canonical.ts` | Create | Branded canonical public type; constructor internal. |
| `packages/core/src/operations/suggestion.ts` | Create | Strict top-level parser. |
| `packages/core/src/operations/normalized.ts` | Create | Exact 15 input shapes and parser/normalizer mappings. |
| `packages/core/src/operations/catalog.ts` | Create | Exhaustive metadata, allowlists, caps, writer-safe policy. |
| `packages/core/src/operations/snapshot.ts` | Create | Snapshot exact-key/entity-specific validation and identity index. |
| `packages/core/src/operations/evidence.ts` | Create | Existing/temporary prose evidence binding. |
| `packages/core/src/operations/resolver.ts` | Create | Limits, allocation, complete 15-branch resolution, repair checks. |
| `packages/core/src/operations/topo-sort.ts` | Create | Stable graph validation and Kahn sort. |
| `packages/core/src/operations/operations-hash.ts` | Create | Exact versioned semantic hash. |
| `packages/core/src/operations/index.ts` | Create | Explicit public exports. |
| `packages/core/src/index.ts` | Modify | `operations` namespace export. |
| `packages/core/src/operations/*.test.ts` | Create | Runtime catalog, policy, evidence, resolution, DAG, hash, repair tests. |
| `packages/core/src/operations/test-fixtures.ts` | Create | Fully defined operation-only fixtures. |

## Locked model input target catalog

`tempRef` top-level selalu identity node operasi. Hanya create rows memakai `tempRef` itu sebagai temporary target. Existing/update/append rows wajib memasok `input.target`; `tempRef` tetap local graph node, bukan entity target.

```ts
export type ModelRef =
  | { readonly existingId: string }
  | { readonly tempRef: string };

export type ModelInputByOperation = {
  readonly 'foundation.update': {
    readonly target: { readonly existingId: string };
    readonly changes: FoundationChanges;
  };
  readonly 'character.create': CharacterFields;
  readonly 'character.update': {
    readonly target: { readonly existingId: string };
    readonly displayName: string;
    readonly role: CharacterRole;
    readonly identity: string | null;
    readonly goal: string | null;
    readonly motivation: string | null;
    readonly address: string | null;
    readonly speechStyle: string | null;
  };
  readonly 'fact.create': FactFields;
  readonly 'fact.update': {
    readonly target: { readonly existingId: string };
    readonly statement: string;
    readonly canonStatus: FactCanonStatus;
    readonly visibility: FactVisibility;
    readonly source: NormalizedFactSource;
  };
  readonly 'state.append': {
    readonly target: { readonly existingId: string };
    readonly stateKey: string;
    readonly value: string;
    readonly evidence: ProseEvidenceBinding;
  };
  readonly 'belief.append': {
    readonly target: { readonly existingId: string };
    readonly fact: ModelRef;
    readonly level: BeliefLevel;
    readonly downgradeReason?: BeliefDowngradeReason;
    readonly evidence: ProseEvidenceBinding;
  };
  readonly 'disclosure.append': {
    readonly target: ModelRef;
    readonly event:
      | { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' }
      | { readonly kind: 'retract'; readonly disclosure: { readonly existingId: string } };
    readonly evidence: ProseEvidenceBinding;
  };
  readonly 'reveal.create': RevealFields;
  readonly 'reveal.update': {
    readonly target: { readonly existingId: string };
    readonly fact: ModelRef;
    readonly position: { readonly chapter: ModelRef; readonly beat?: ModelRef };
    readonly safeDirectives: readonly string[];
  };
  readonly 'breadcrumb.create': {
    readonly reveal: ModelRef;
    readonly position: { readonly chapter: ModelRef; readonly beat?: ModelRef };
    readonly safeDirective: string;
  };
  readonly 'outline.create': { readonly node: ModelOutlineNode };
  readonly 'outline.update': {
    readonly target: { readonly existingId: string };
    readonly node: ModelOutlineNode;
  };
  readonly 'prose.version.create': {
    readonly beat: ModelRef;
    readonly content: string;
  };
  readonly 'prose.accept': {
    readonly target: { readonly existingId: string };
    readonly proseVersion: ModelRef;
  };
};
```

Exact target mapping:

| Operation | Model target source | Normalized target |
|---|---|---|
| `foundation.update` | `input.target.existingId` | existing `foundation` |
| `character.create` | top-level `tempRef` | temporary `character` |
| `character.update` | `input.target.existingId` | existing `character` |
| `fact.create` | top-level `tempRef` | temporary `fact` |
| `fact.update` | `input.target.existingId` | existing `fact` |
| `state.append` | `input.target.existingId` | existing `character` |
| `belief.append` | `input.target.existingId` | existing `character` |
| `disclosure.append` | `input.target` | existing/temporary `fact` |
| `reveal.create` | top-level `tempRef` | temporary `reveal` |
| `reveal.update` | `input.target.existingId` | existing `reveal` |
| `breadcrumb.create` | top-level `tempRef` | temporary `reveal_breadcrumb` |
| `outline.create` | top-level `tempRef`, type from `input.node.kind` | temporary `roadmap/arc/chapter/beat` |
| `outline.update` | `input.target.existingId`, type from `input.node.kind` | existing `roadmap/arc/chapter/beat` |
| `prose.version.create` | top-level `tempRef` | temporary `prose_version` |
| `prose.accept` | `input.target.existingId` | existing `beat` |

Allowed aliases are exact and one-way: top-level `temp_id -> tempRef`, `op -> operationType`, `dependencies -> dependsOn`; input `character_name -> displayName`, `fact_text -> statement`, `prose_text -> content`. Alias plus canonical key is invalid. No target alias exists.

---

### Task 1: Register W1.5 deterministic verification targets

**Global Constraints:** Verification contract lands before implementation tests; exact two rows only; do not update `docs/PROGRESS-CHECKLIST.md`.

**Interfaces:** Consumes approved W1.5 invariants. Produces named CI targets for stable DAG/cycle reporting and canonical operations hash/permutation behavior.

**Files:**
- Modify: `docs/verification-matrix.md`

- [ ] **Step 1: Append exact invariant rows before writing tests**

Append immediately before `When adding invariants`:

```markdown
| Operation DAG order and cycle members are stable across input permutations | S3 | `operation-topo-sort` | unit |
| Canonical operations hash covers semantic material and is permutation-stable | S3 | `operations-hash` | unit |
```

- [ ] **Step 2: Format, check, and inspect exact documentation diff**

```bash
pnpm exec prettier --write docs/verification-matrix.md
pnpm exec prettier --check docs/verification-matrix.md
git diff --check -- docs/verification-matrix.md
git diff -- docs/verification-matrix.md
```

Expected: write exits 0; check prints `Checking formatting...` then `All matched files use Prettier code style!`; `git diff --check` emits nothing; diff contains exactly two added W1.5 rows and no changed existing invariant.

- [ ] **Step 3: Commit verification contract green**

```bash
git add docs/verification-matrix.md
git diff --cached --check
git commit -m "docs: map W1.5 operation invariants"
```

Expected: commit succeeds with only `docs/verification-matrix.md` changed.

---

### Task 2: Foundational contracts and dedicated compile-time boundary

**Global Constraints:** Pure TypeScript only; no barrel import; type fixture excluded from production `tsconfig.json`; `@ts-expect-error` must be consumed by a real compiler error.

**Interfaces:** Consumes W1.2 TypeScript setup. Produces errors, entity/reference/snapshot/context contracts, payload unions, branded canonical interface, dedicated type-test config/command.

**Files:**
- Create: `packages/core/src/operations/errors.ts`
- Create: `packages/core/src/operations/entities.ts`
- Create: `packages/core/src/operations/payloads.ts`
- Create: `packages/core/src/operations/canonical.ts`
- Create: `packages/core/tsconfig.operations-type-tests.json`
- Create: `packages/core/type-tests/op-type-boundary.type-test.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: Add failing dedicated type fixture and command**

Create `packages/core/tsconfig.operations-type-tests.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "incremental": false,
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/operations/**/*.ts", "type-tests/**/*.ts"],
  "exclude": ["dist", "node_modules", "src/**/*.test.ts"]
}
```

Add package script after `test:unit`:

```json
"test:type:operations": "tsc -p tsconfig.operations-type-tests.json --pretty false"
```

Create `packages/core/type-tests/op-type-boundary.type-test.ts`:

```ts
import type { CanonicalChangeOperation } from '../src/operations/canonical.js';
import type { ModelSuggestionDraft } from '../src/operations/suggestion.js';
import type { NormalizedOperationDraft } from '../src/operations/normalized.js';

declare const model: ModelSuggestionDraft;
declare const normalized: NormalizedOperationDraft;
declare const canonical: CanonicalChangeOperation;

// @ts-expect-error model suggestion lacks normalized target and payload
const modelAsNormalized: NormalizedOperationDraft = model;
// @ts-expect-error normalized draft lacks canonical IDs, revision, risk, ordinal, and brand
const normalizedAsCanonical: CanonicalChangeOperation = normalized;
// @ts-expect-error canonical operation is not model output
const canonicalAsModel: ModelSuggestionDraft = canonical;
// @ts-expect-error model cannot construct internal canonical brand
const forged: CanonicalChangeOperation = {
  schemaVersion: 1,
  operationId: 'op-1',
  ordinal: 0,
  operationType: 'foundation.update',
  targetEntityType: 'foundation',
  targetId: 'foundation-1',
  expectedRevision: 0,
  risk: 'medium',
  payload: { kind: 'foundation.update', changes: { conflict: 'x' } },
};

void [modelAsNormalized, normalizedAsCanonical, canonicalAsModel, forged];
```

Run: `pnpm --filter @narraza/core run test:type:operations`

Expected: FAIL with missing operation modules.

- [ ] **Step 2: Implement exact error and entity contracts**

Create `errors.ts`:

```ts
export type OperationErrorCode =
  | 'INVALID_SUGGESTION' | 'UNKNOWN_OPERATION' | 'OPERATION_NOT_ALLOWED'
  | 'OPERATION_LIMIT_EXCEEDED' | 'DUPLICATE_TEMP_REF' | 'UNRESOLVED_TEMP_REF'
  | 'INVALID_DEPENDENCY' | 'DEPENDENCY_CYCLE' | 'INVALID_SNAPSHOT'
  | 'DUPLICATE_SNAPSHOT' | 'ENTITY_NOT_FOUND' | 'REVISION_REQUIRED'
  | 'PROSE_ACCEPT_REQUIRED' | 'PROSE_ACCEPT_NOT_LAST'
  | 'REPAIR_REEXTRACTION_REQUIRED' | 'INVALID_PROSE_EVIDENCE_BINDING';

export class OperationDomainError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'OperationDomainError';
  }
}
```

Create `entities.ts`:

```ts
import { OperationDomainError } from './errors.js';

export type OperationContract = 'intake' | 'foundation' | 'outline' | 'beat.write' | 'repair';
export type OperationRisk = 'low' | 'medium' | 'high';
export type EntityType = 'foundation' | 'character' | 'fact' | 'character_state' |
  'character_belief' | 'fact_disclosure' | 'reveal' | 'reveal_breadcrumb' |
  'roadmap' | 'arc' | 'chapter' | 'beat' | 'prose_version';
export type Ref =
  | { readonly kind: 'existing'; readonly entityType: EntityType; readonly entityId: string }
  | { readonly kind: 'temporary'; readonly entityType: EntityType; readonly tempRef: string };
export type CanonicalOperationType = 'foundation.update' | 'character.create' |
  'character.update' | 'fact.create' | 'fact.update' | 'state.append' |
  'belief.append' | 'disclosure.append' | 'reveal.create' | 'reveal.update' |
  'breadcrumb.create' | 'outline.create' | 'outline.update' |
  'prose.version.create' | 'prose.accept';
export type SuggestionOperationType = CanonicalOperationType;
export const TEMP_REF_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface CanonicalEntitySnapshot {
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly exists: boolean;
  readonly deleted: boolean;
  readonly revision: number | null;
  readonly parentId: string | null;
  readonly candidateId?: string;
  readonly extractionRunId?: string;
  readonly content?: string;
  readonly contentHash?: string;
  readonly ordinal?: number;
  readonly narrativeSequence?: number;
  readonly nextOrdinal?: number;
  readonly nextNarrativeSequence?: number;
  readonly factKey?: string;
  readonly beatId?: string;
  readonly targetSequence?: number;
}
export interface RepairExtractionBinding {
  readonly sourceProseVersionId: string;
  readonly repairedProseVersionId: string;
  readonly extractionSourceProseVersionId: string;
}
export type IdAllocator = (entityType: EntityType, localRef: string) => string;
export interface ResolutionContext {
  readonly contract: OperationContract;
  readonly candidateId: string;
  readonly extractionRunId: string;
  readonly snapshots: readonly CanonicalEntitySnapshot[];
  readonly repairBinding?: RepairExtractionBinding;
  readonly allocateId: IdAllocator;
  readonly allocateOperationId: (localRef: string) => string;
  readonly allocateFactKey: (localRef: string) => string;
}
export const compareCodeUnits = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
export function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new OperationDomainError('INVALID_SUGGESTION', 'expected plain object');
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key)))
    throw new OperationDomainError('INVALID_SUGGESTION', 'object keys do not match schema');
  return value;
}
export function nonEmpty(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new OperationDomainError('INVALID_SUGGESTION', 'expected non-empty string');
  return value;
}
export function nullableString(value: unknown): string | null {
  return value === null ? null : nonEmpty(value);
}
export function safeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new OperationDomainError('INVALID_SUGGESTION', 'expected safe non-negative integer');
  return value as number;
}
```

- [ ] **Step 3: Implement complete payload unions**

Create `payloads.ts`:

```ts
import type { Ref } from './entities.js';
export type CharacterRole = 'main' | 'supporting';
export type FactCanonStatus = 'draft' | 'established' | 'disproven';
export type FactVisibility = 'writer_safe' | 'planner_only';
export type BeliefLevel = 'unknown' | 'suspected' | 'believed' | 'known' | 'disproven';
export type BeliefDowngradeReason = 'new_evidence' | 'source_discredited' |
  'memory_loss' | 'deliberate_deception' | 'canon_correction';
export interface FoundationChanges { readonly coreConcept?: string | null; readonly conflict?: string | null; readonly endingDirection?: string | null; readonly readerPromise?: string | null }
export interface CharacterFields { readonly displayName: string; readonly role: CharacterRole; readonly identity: string | null; readonly goal: string | null; readonly motivation: string | null; readonly address: string | null; readonly speechStyle: string | null }
export interface ProseEvidenceBinding { readonly proseVersionRef: Ref; readonly proseContentHash: string; readonly startUtf16: number; readonly endUtf16: number }
export interface CanonicalProseEvidenceBinding { readonly proseVersionId: string; readonly proseContentHash: string; readonly startUtf16: number; readonly endUtf16: number }
export type NormalizedFactSource = { readonly kind: 'foundation' } | { readonly kind: 'prose'; readonly evidence: ProseEvidenceBinding };
export interface FactFields { readonly statement: string; readonly canonStatus: FactCanonStatus; readonly visibility: FactVisibility; readonly source: NormalizedFactSource }
export type ModelRef = { readonly existingId: string } | { readonly tempRef: string };
export type ModelOutlineNode =
  | { readonly kind: 'roadmap'; readonly title: string }
  | { readonly kind: 'arc'; readonly parent: ModelRef; readonly title: string }
  | { readonly kind: 'chapter'; readonly parent: ModelRef; readonly title: string }
  | { readonly kind: 'beat'; readonly parent: ModelRef; readonly title: string; readonly purpose: string };
export interface RevealFields { readonly fact: Ref; readonly position: { readonly chapter: Ref; readonly beat?: Ref }; readonly safeDirectives: readonly string[] }
export type NormalizedOperationPayload =
  | { readonly kind: 'foundation.update'; readonly changes: FoundationChanges }
  | ({ readonly kind: 'character.create' | 'character.update' } & CharacterFields)
  | ({ readonly kind: 'fact.create' | 'fact.update' } & FactFields)
  | { readonly kind: 'state.append'; readonly stateKey: string; readonly value: string; readonly evidence: ProseEvidenceBinding }
  | { readonly kind: 'belief.append'; readonly fact: Ref; readonly level: BeliefLevel; readonly downgradeReason?: BeliefDowngradeReason; readonly evidence: ProseEvidenceBinding }
  | { readonly kind: 'disclosure.append'; readonly event: { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' } | { readonly kind: 'retract'; readonly disclosure: Ref }; readonly evidence: ProseEvidenceBinding }
  | ({ readonly kind: 'reveal.create' | 'reveal.update' } & RevealFields)
  | { readonly kind: 'breadcrumb.create'; readonly reveal: Ref; readonly position: { readonly chapter: Ref; readonly beat?: Ref }; readonly safeDirective: string }
  | { readonly kind: 'outline.create' | 'outline.update'; readonly node: { readonly kind: 'roadmap'; readonly title: string } | { readonly kind: 'arc' | 'chapter'; readonly parent: Ref; readonly title: string } | { readonly kind: 'beat'; readonly parent: Ref; readonly title: string; readonly purpose: string } }
  | { readonly kind: 'prose.version.create'; readonly beat: Ref; readonly content: string }
  | { readonly kind: 'prose.accept'; readonly proseVersion: Ref };
export type CanonicalOperationPayload =
  | { readonly kind: 'foundation.update'; readonly changes: FoundationChanges }
  | ({ readonly kind: 'character.create' | 'character.update' } & CharacterFields)
  | { readonly kind: 'fact.create' | 'fact.update'; readonly factKey: string; readonly statement: string; readonly canonStatus: FactCanonStatus; readonly visibility: FactVisibility; readonly source: { readonly kind: 'foundation' } | { readonly kind: 'prose'; readonly evidence: CanonicalProseEvidenceBinding } }
  | { readonly kind: 'state.append'; readonly effectiveSequence: number; readonly stateKey: string; readonly value: string; readonly evidence: CanonicalProseEvidenceBinding }
  | { readonly kind: 'belief.append'; readonly factId: string; readonly beliefKey: string; readonly effectiveSequence: number; readonly level: BeliefLevel; readonly downgradeReason?: BeliefDowngradeReason; readonly evidence: CanonicalProseEvidenceBinding }
  | { readonly kind: 'disclosure.append'; readonly effectiveSequence: number; readonly event: { readonly kind: 'disclose'; readonly result: 'suspected' | 'known' } | { readonly kind: 'retract'; readonly disclosureId: string }; readonly evidence: CanonicalProseEvidenceBinding }
  | { readonly kind: 'reveal.create' | 'reveal.update'; readonly factId: string; readonly chapterId: string; readonly beatId?: string; readonly targetSequence: number; readonly safeDirectives: readonly string[] }
  | { readonly kind: 'breadcrumb.create'; readonly revealId: string; readonly chapterId: string; readonly beatId?: string; readonly sequence: number; readonly safeDirective: string }
  | { readonly kind: 'outline.create' | 'outline.update'; readonly node: { readonly kind: 'roadmap'; readonly title: string } | { readonly kind: 'arc'; readonly parentId: string; readonly title: string; readonly ordinal: number } | { readonly kind: 'chapter'; readonly parentId: string; readonly title: string; readonly ordinal: number; readonly narrativeSequence: number } | { readonly kind: 'beat'; readonly parentId: string; readonly title: string; readonly purpose: string; readonly ordinal: number; readonly narrativeSequence: number } }
  | { readonly kind: 'prose.version.create'; readonly beatId: string; readonly content: string; readonly contentHash: string }
  | { readonly kind: 'prose.accept'; readonly proseVersionId: string };
```

Create `canonical.ts`:

```ts
import type { CanonicalOperationType, EntityType, OperationRisk } from './entities.js';
import type { CanonicalOperationPayload } from './payloads.js';
const CANONICAL_OPERATION: unique symbol = Symbol('CanonicalChangeOperation');
export interface CanonicalChangeOperation { readonly schemaVersion: 1; readonly operationId: string; readonly ordinal: number; readonly operationType: CanonicalOperationType; readonly targetEntityType: EntityType; readonly targetId: string; readonly expectedRevision: number | null; readonly risk: OperationRisk; readonly payload: CanonicalOperationPayload; readonly [CANONICAL_OPERATION]: true }
export type UnbrandedCanonicalOperation = Omit<CanonicalChangeOperation, typeof CANONICAL_OPERATION>;
export const brandCanonicalOperation = (value: UnbrandedCanonicalOperation): CanonicalChangeOperation => ({ ...value, [CANONICAL_OPERATION]: true });
```

`CANONICAL_OPERATION`, `UnbrandedCanonicalOperation`, dan `brandCanonicalOperation` tetap module-internal secara package API; Task 10 tidak mengekspornya.

- [ ] **Step 4: Add temporary type stubs, run compiler, then commit green foundation**

Create `suggestion.ts` and `normalized.ts` with compile-safe contracts only; Task 3 replaces contents fully:

```ts
// suggestion.ts
import type { SuggestionOperationType } from './entities.js';
export interface ModelSuggestionDraft { readonly schemaVersion: 1; readonly tempRef: string; readonly operationType: SuggestionOperationType; readonly input: unknown; readonly dependsOn?: readonly string[] }
```

```ts
// normalized.ts
import type { CanonicalOperationType, Ref } from './entities.js';
import type { NormalizedOperationPayload } from './payloads.js';
export interface NormalizedOperationDraft { readonly schemaVersion: 1; readonly localRef: string; readonly operationType: CanonicalOperationType; readonly target: Ref; readonly payload: NormalizedOperationPayload; readonly dependsOn: readonly string[] }
```

Run:

```bash
pnpm --filter @narraza/core run test:type:operations
pnpm --filter @narraza/core build
git add packages/core/package.json packages/core/tsconfig.operations-type-tests.json packages/core/type-tests packages/core/src/operations
git commit -m "test(core): lock operation type boundaries"
```

Expected: `tsc` exit 0, proving all four `@ts-expect-error` directives are consumed; production build exit 0; commit green.

---

### Task 3: Strict parser and exact 15-operation normalization

**Global Constraints:** Direct imports only; no input spread; alias collision rejected; every branch validates exact keys and concrete runtime types before constructing output.

**Interfaces:** Consumes `entities.ts`, `payloads.ts`, `errors.ts`. Produces `parseModelSuggestion`, `normalizeSuggestion`, `parseAndNormalizeSuggestion`, exact targets and payloads for all 15 operations.

**Files:**
- Replace: `packages/core/src/operations/suggestion.ts`
- Replace: `packages/core/src/operations/normalized.ts`
- Create: `packages/core/src/operations/payload-catalog.test.ts`
- Create: `packages/core/src/operations/op-type-boundary.test.ts`

- [ ] **Step 1: Write RED exact-key/type/target table tests**

Create `payload-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAndNormalizeSuggestion } from './normalized.js';
const h = 'a'.repeat(64);
const ref = (existingId: string) => ({ existingId });
const evidence = { proseVersionRef: ref('pv-1'), proseContentHash: h, startUtf16: 0, endUtf16: 1 };
const character = { displayName: 'Mira', role: 'main', identity: null, goal: null, motivation: null, address: null, speechStyle: null } as const;
const fact = { statement: 'Pintu terkunci.', canonStatus: 'established', visibility: 'writer_safe', source: { kind: 'foundation' } } as const;
const cases = [
  ['foundation.update', { target: ref('foundation-1'), changes: { conflict: 'Konflik' } }, ['existing', 'foundation', 'foundation-1']],
  ['character.create', character, ['temporary', 'character', 'op2']],
  ['character.update', { target: ref('char-1'), ...character }, ['existing', 'character', 'char-1']],
  ['fact.create', fact, ['temporary', 'fact', 'op4']],
  ['fact.update', { target: ref('fact-1'), ...fact }, ['existing', 'fact', 'fact-1']],
  ['state.append', { target: ref('char-1'), stateKey: 'place', value: 'arsip', evidence }, ['existing', 'character', 'char-1']],
  ['belief.append', { target: ref('char-1'), fact: ref('fact-1'), level: 'known', evidence }, ['existing', 'character', 'char-1']],
  ['disclosure.append', { target: { tempRef: 'factMaker' }, event: { kind: 'disclose', result: 'known' }, evidence }, ['temporary', 'fact', 'factMaker']],
  ['reveal.create', { fact: ref('fact-1'), position: { chapter: ref('chapter-1') }, safeDirectives: [] }, ['temporary', 'reveal', 'op9']],
  ['reveal.update', { target: ref('reveal-1'), fact: ref('fact-1'), position: { chapter: ref('chapter-1') }, safeDirectives: ['Tahan.'] }, ['existing', 'reveal', 'reveal-1']],
  ['breadcrumb.create', { reveal: ref('reveal-1'), position: { chapter: ref('chapter-1') }, safeDirective: 'Kunci tampak.' }, ['temporary', 'reveal_breadcrumb', 'op11']],
  ['outline.create', { node: { kind: 'beat', parent: ref('chapter-1'), title: 'Pintu', purpose: 'Masuk' } }, ['temporary', 'beat', 'op12']],
  ['outline.update', { target: ref('chapter-1'), node: { kind: 'chapter', parent: ref('arc-1'), title: 'Arsip' } }, ['existing', 'chapter', 'chapter-1']],
  ['prose.version.create', { beat: ref('beat-1'), content: 'A' }, ['temporary', 'prose_version', 'op14']],
  ['prose.accept', { target: ref('beat-1'), proseVersion: { tempRef: 'op14' } }, ['existing', 'beat', 'beat-1']],
] as const;

describe('15 operation model mappings', () => {
  it.each(cases)('%s maps exact target and payload', (operationType, input, expectedTarget) => {
    const index = cases.findIndex((entry) => entry[0] === operationType) + 1;
    const result = parseAndNormalizeSuggestion({ schemaVersion: 1, tempRef: `op${index}`, operationType, input });
    expect([result.target.kind, result.target.entityType, result.target.kind === 'existing' ? result.target.entityId : result.target.tempRef]).toEqual(expectedTarget);
    expect(result.payload.kind).toBe(operationType);
    expect(result.dependsOn).toEqual([]);
  });

  it.each(cases)('%s rejects unknown and wrong-typed input keys', (operationType, input) => {
    expect(() => parseAndNormalizeSuggestion({ schemaVersion: 1, tempRef: 'x', operationType, input: { ...input, injected: true } })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() => parseAndNormalizeSuggestion({ schemaVersion: 1, tempRef: 'x', operationType, input: null })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });

  it('rejects unknown nested keys and alias collisions', () => {
    expect(() => parseAndNormalizeSuggestion({ schemaVersion: 1, tempRef: 'x', operationType: 'fact.create', input: { ...fact, source: { kind: 'foundation', leak: true } } })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() => parseAndNormalizeSuggestion({ schemaVersion: 1, temp_id: 'x', tempRef: 'y', op: 'fact.create', input: fact })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
    expect(() => parseAndNormalizeSuggestion({ schemaVersion: 1, tempRef: 'x', operationType: 'fact.create', input: { ...fact, fact_text: 'alias' } })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });
});
```

Create `op-type-boundary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseModelSuggestion } from './suggestion.js';
describe('runtime model boundary', () => {
  it.each(['operationId', 'targetId', 'expectedRevision', 'risk', 'ordinal', 'hash'])('rejects injected %s', (key) => {
    expect(() => parseModelSuggestion({ schemaVersion: 1, tempRef: 'x', operationType: 'fact.create', input: {}, [key]: 'bad' })).toThrowError(expect.objectContaining({ code: 'INVALID_SUGGESTION' }));
  });
});
```

Run: `pnpm --filter @narraza/core exec vitest run src/operations/payload-catalog.test.ts src/operations/op-type-boundary.test.ts`

Expected: FAIL because parser functions do not exist.

- [ ] **Step 2: Replace strict top-level parser**

Replace `suggestion.ts`:

```ts
import { exactRecord, nonEmpty, TEMP_REF_PATTERN, type SuggestionOperationType } from './entities.js';
import { OperationDomainError } from './errors.js';
const TYPES = new Set<SuggestionOperationType>(['foundation.update','character.create','character.update','fact.create','fact.update','state.append','belief.append','disclosure.append','reveal.create','reveal.update','breadcrumb.create','outline.create','outline.update','prose.version.create','prose.accept']);
export interface ModelSuggestionDraft { readonly schemaVersion: 1; readonly tempRef: string; readonly operationType: SuggestionOperationType; readonly input: unknown; readonly dependsOn?: readonly string[] }
const choose = (record: Record<string, unknown>, canonical: string, alias: string): unknown => {
  if (Object.hasOwn(record, canonical) && Object.hasOwn(record, alias)) throw new OperationDomainError('INVALID_SUGGESTION', `cannot combine ${canonical} and ${alias}`);
  return Object.hasOwn(record, canonical) ? record[canonical] : record[alias];
};
export function parseModelSuggestion(value: unknown): ModelSuggestionDraft {
  const raw = exactRecord(value, ['schemaVersion', 'input'], ['tempRef','temp_id','operationType','op','dependsOn','dependencies']);
  const tempRef = nonEmpty(choose(raw, 'tempRef', 'temp_id'));
  if (!TEMP_REF_PATTERN.test(tempRef)) throw new OperationDomainError('INVALID_SUGGESTION', 'invalid tempRef');
  const operationType = nonEmpty(choose(raw, 'operationType', 'op')) as SuggestionOperationType;
  if (!TYPES.has(operationType)) throw new OperationDomainError('UNKNOWN_OPERATION', `unknown operation ${operationType}`);
  if (raw.schemaVersion !== 1) throw new OperationDomainError('INVALID_SUGGESTION', 'schemaVersion must be 1');
  const dependencyValue = choose(raw, 'dependsOn', 'dependencies');
  if (dependencyValue !== undefined && !Array.isArray(dependencyValue)) throw new OperationDomainError('INVALID_DEPENDENCY', 'dependencies must be dense array');
  const dependsOn = dependencyValue === undefined ? undefined : dependencyValue.map((item, index) => {
    if (!Object.hasOwn(dependencyValue, index)) throw new OperationDomainError('INVALID_DEPENDENCY', 'sparse dependencies');
    const ref = nonEmpty(item); if (!TEMP_REF_PATTERN.test(ref)) throw new OperationDomainError('INVALID_DEPENDENCY', 'invalid dependency'); return ref;
  });
  if (dependsOn !== undefined && new Set(dependsOn).size !== dependsOn.length) throw new OperationDomainError('INVALID_DEPENDENCY', 'duplicate dependency');
  return dependsOn === undefined ? { schemaVersion: 1, tempRef, operationType, input: raw.input } : { schemaVersion: 1, tempRef, operationType, input: raw.input, dependsOn };
}
```

- [ ] **Step 3: Replace exact input parser/normalizer**

Replace `normalized.ts` with an exhaustive switch. These helper definitions are complete; every branch below constructs a new payload and strips model target.

```ts
import { exactRecord, nonEmpty, nullableString, safeInteger, SHA256_PATTERN, type CanonicalOperationType, type EntityType, type Ref } from './entities.js';
import { OperationDomainError } from './errors.js';
import type { BeliefDowngradeReason, BeliefLevel, CharacterFields, CharacterRole, FactCanonStatus, FactVisibility, FoundationChanges, ModelOutlineNode, ModelRef, NormalizedFactSource, NormalizedOperationPayload, ProseEvidenceBinding } from './payloads.js';
import { parseModelSuggestion, type ModelSuggestionDraft } from './suggestion.js';
export interface NormalizedOperationDraft { readonly schemaVersion: 1; readonly localRef: string; readonly operationType: CanonicalOperationType; readonly target: Ref; readonly payload: NormalizedOperationPayload; readonly dependsOn: readonly string[] }
const oneOf = <T extends string>(value: unknown, values: readonly T[]): T => { if (typeof value !== 'string' || !values.includes(value as T)) throw new OperationDomainError('INVALID_SUGGESTION', 'invalid enum'); return value as T; };
const existing = (id: unknown, entityType: EntityType): Ref => ({ kind: 'existing', entityType, entityId: nonEmpty(id) });
const temporary = (tempRef: unknown, entityType: EntityType): Ref => ({ kind: 'temporary', entityType, tempRef: nonEmpty(tempRef) });
const modelRef = (value: unknown, entityType: EntityType, existingOnly = false): Ref => { const r = exactRecord(value, [], ['existingId','tempRef']); if (Object.keys(r).length !== 1) throw new OperationDomainError('INVALID_SUGGESTION', 'reference needs exactly one identity'); if (Object.hasOwn(r, 'existingId')) return existing(r.existingId, entityType); if (existingOnly) throw new OperationDomainError('INVALID_SUGGESTION', 'temporary target forbidden'); return temporary(r.tempRef, entityType); };
const strings = (value: unknown): readonly string[] => { if (!Array.isArray(value)) throw new OperationDomainError('INVALID_SUGGESTION', 'expected string array'); return value.map((item, index) => { if (!Object.hasOwn(value, index)) throw new OperationDomainError('INVALID_SUGGESTION', 'sparse array'); return nonEmpty(item); }); };
const alias = (r: Record<string, unknown>, canonical: string, alternative: string): unknown => { if (Object.hasOwn(r, canonical) && Object.hasOwn(r, alternative)) throw new OperationDomainError('INVALID_SUGGESTION', 'alias collision'); return Object.hasOwn(r, canonical) ? r[canonical] : r[alternative]; };
const character = (value: unknown, update: boolean): { readonly target?: Ref; readonly fields: CharacterFields } => { const r = exactRecord(value, update ? ['target','role','identity','goal','motivation','address','speechStyle'] : ['role','identity','goal','motivation','address','speechStyle'], ['displayName','character_name']); return { ...(update ? { target: modelRef(r.target, 'character', true) } : {}), fields: { displayName: nonEmpty(alias(r,'displayName','character_name')), role: oneOf<CharacterRole>(r.role,['main','supporting']), identity: nullableString(r.identity), goal: nullableString(r.goal), motivation: nullableString(r.motivation), address: nullableString(r.address), speechStyle: nullableString(r.speechStyle) } }; };
const evidence = (value: unknown): ProseEvidenceBinding => { const r = exactRecord(value,['proseVersionRef','proseContentHash','startUtf16','endUtf16']); const hash = nonEmpty(r.proseContentHash); if (!SHA256_PATTERN.test(hash)) throw new OperationDomainError('INVALID_SUGGESTION','invalid evidence hash'); return { proseVersionRef: modelRef(r.proseVersionRef,'prose_version'), proseContentHash: hash, startUtf16: safeInteger(r.startUtf16), endUtf16: safeInteger(r.endUtf16) }; };
const source = (value: unknown): NormalizedFactSource => { const r = exactRecord(value,['kind'],['evidence']); if (r.kind === 'foundation') { if (Object.hasOwn(r,'evidence')) throw new OperationDomainError('INVALID_SUGGESTION','foundation source has no evidence'); return { kind:'foundation' }; } if (r.kind === 'prose' && Object.hasOwn(r,'evidence')) return { kind:'prose', evidence:evidence(r.evidence) }; throw new OperationDomainError('INVALID_SUGGESTION','invalid fact source'); };
const factFields = (r: Record<string, unknown>) => ({ statement: nonEmpty(alias(r,'statement','fact_text')), canonStatus: oneOf<FactCanonStatus>(r.canonStatus,['draft','established','disproven']), visibility: oneOf<FactVisibility>(r.visibility,['writer_safe','planner_only']), source: source(r.source) });
const position = (value: unknown) => { const r = exactRecord(value,['chapter'],['beat']); const chapter = modelRef(r.chapter,'chapter'); return Object.hasOwn(r,'beat') ? { chapter, beat:modelRef(r.beat,'beat') } : { chapter }; };
const outlineNode = (value: unknown): { readonly entityType: 'roadmap'|'arc'|'chapter'|'beat'; readonly node: NormalizedOperationPayload & unknown } => { const base = exactRecord(value,['kind','title'],['parent','purpose']); const kind = oneOf(base.kind,['roadmap','arc','chapter','beat'] as const); if (kind === 'roadmap') { exactRecord(value,['kind','title']); return { entityType:kind, node:{ kind:'outline.create', node:{ kind, title:nonEmpty(base.title) } } as NormalizedOperationPayload }; } const parentType = kind === 'arc' ? 'roadmap' : kind === 'chapter' ? 'arc' : 'chapter'; if (kind === 'beat') { const r=exactRecord(value,['kind','parent','title','purpose']); return { entityType:kind, node:{ kind:'outline.create', node:{ kind, parent:modelRef(r.parent,parentType), title:nonEmpty(r.title), purpose:nonEmpty(r.purpose) } } as NormalizedOperationPayload }; } const r=exactRecord(value,['kind','parent','title']); return { entityType:kind, node:{ kind:'outline.create', node:{ kind, parent:modelRef(r.parent,parentType), title:nonEmpty(r.title) } } as NormalizedOperationPayload }; };

export function normalizeSuggestion(s: ModelSuggestionDraft): NormalizedOperationDraft {
  const deps = s.dependsOn ?? [];
  switch (s.operationType) {
    case 'foundation.update': { const r=exactRecord(s.input,['target','changes']); const c=exactRecord(r.changes,[],['coreConcept','conflict','endingDirection','readerPromise']); if (Object.keys(c).length===0) throw new OperationDomainError('INVALID_SUGGESTION','empty changes'); const changes: FoundationChanges={}; for (const key of Object.keys(c) as (keyof FoundationChanges)[]) (changes as Record<string,unknown>)[key]=nullableString(c[key]); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:modelRef(r.target,'foundation',true),payload:{kind:s.operationType,changes},dependsOn:deps }; }
    case 'character.create': case 'character.update': { const c=character(s.input,s.operationType==='character.update'); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:c.target??temporary(s.tempRef,'character'),payload:{kind:s.operationType,...c.fields},dependsOn:deps }; }
    case 'fact.create': case 'fact.update': { const update=s.operationType==='fact.update'; const r=exactRecord(s.input,update?['target','canonStatus','visibility','source']:['canonStatus','visibility','source'],['statement','fact_text']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:update?modelRef(r.target,'fact',true):temporary(s.tempRef,'fact'),payload:{kind:s.operationType,...factFields(r)},dependsOn:deps }; }
    case 'state.append': { const r=exactRecord(s.input,['target','stateKey','value','evidence']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:modelRef(r.target,'character',true),payload:{kind:s.operationType,stateKey:nonEmpty(r.stateKey),value:nonEmpty(r.value),evidence:evidence(r.evidence)},dependsOn:deps }; }
    case 'belief.append': { const r=exactRecord(s.input,['target','fact','level','evidence'],['downgradeReason']); const p={kind:s.operationType,fact:modelRef(r.fact,'fact'),level:oneOf<BeliefLevel>(r.level,['unknown','suspected','believed','known','disproven']),evidence:evidence(r.evidence)} as const; return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:modelRef(r.target,'character',true),payload:Object.hasOwn(r,'downgradeReason')?{...p,downgradeReason:oneOf<BeliefDowngradeReason>(r.downgradeReason,['new_evidence','source_discredited','memory_loss','deliberate_deception','canon_correction'])}:p,dependsOn:deps }; }
    case 'disclosure.append': { const r=exactRecord(s.input,['target','event','evidence']); const e=exactRecord(r.event,['kind'],['result','disclosure']); const event=e.kind==='disclose'?(exactRecord(r.event,['kind','result']),{kind:'disclose' as const,result:oneOf(e.result,['suspected','known'] as const)}):e.kind==='retract'?(exactRecord(r.event,['kind','disclosure']),{kind:'retract' as const,disclosure:modelRef(e.disclosure,'fact_disclosure',true)}):(()=>{throw new OperationDomainError('INVALID_SUGGESTION','invalid disclosure event')})(); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:modelRef(r.target,'fact'),payload:{kind:s.operationType,event,evidence:evidence(r.evidence)},dependsOn:deps }; }
    case 'reveal.create': case 'reveal.update': { const update=s.operationType==='reveal.update'; const r=exactRecord(s.input,update?['target','fact','position','safeDirectives']:['fact','position','safeDirectives']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:update?modelRef(r.target,'reveal',true):temporary(s.tempRef,'reveal'),payload:{kind:s.operationType,fact:modelRef(r.fact,'fact'),position:position(r.position),safeDirectives:strings(r.safeDirectives)},dependsOn:deps }; }
    case 'breadcrumb.create': { const r=exactRecord(s.input,['reveal','position','safeDirective']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:temporary(s.tempRef,'reveal_breadcrumb'),payload:{kind:s.operationType,reveal:modelRef(r.reveal,'reveal'),position:position(r.position),safeDirective:nonEmpty(r.safeDirective)},dependsOn:deps }; }
    case 'outline.create': case 'outline.update': { const update=s.operationType==='outline.update'; const r=exactRecord(s.input,update?['target','node']:['node']); const parsed=outlineNode(r.node); const node=(parsed.node as Extract<NormalizedOperationPayload,{kind:'outline.create'}>).node; return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:update?modelRef(r.target,parsed.entityType,true):temporary(s.tempRef,parsed.entityType),payload:{kind:s.operationType,node},dependsOn:deps }; }
    case 'prose.version.create': { const r=exactRecord(s.input,['beat'],['content','prose_text']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:temporary(s.tempRef,'prose_version'),payload:{kind:s.operationType,beat:modelRef(r.beat,'beat'),content:nonEmpty(alias(r,'content','prose_text'))},dependsOn:deps }; }
    case 'prose.accept': { const r=exactRecord(s.input,['target','proseVersion']); return { schemaVersion:1,localRef:s.tempRef,operationType:s.operationType,target:modelRef(r.target,'beat',true),payload:{kind:s.operationType,proseVersion:modelRef(r.proseVersion,'prose_version')},dependsOn:deps }; }
  }
}
export const parseAndNormalizeSuggestion = (value: unknown): NormalizedOperationDraft => normalizeSuggestion(parseModelSuggestion(value));
```

- [ ] **Step 4: Run all parser boundaries and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/payload-catalog.test.ts src/operations/op-type-boundary.test.ts
pnpm --filter @narraza/core run test:type:operations
pnpm --filter @narraza/core build
git add packages/core/src/operations packages/core/type-tests
 git commit -m "feat(core): normalize all operation model inputs"
```

Expected: 15 mapping rows pass; 30 exact-key/type rows pass; nested unknown/collision tests pass; type-test/build exit 0.

---

### Task 4: Catalog, writer-safe contract policy, and snapshot validation

**Global Constraints:** Policy runs before allocation; `beat.write` and `repair` reject every `planner_only` fact; snapshot identity is `(entityType, entityId)` and duplicate identity always rejected even when payloads match.

**Interfaces:** Consumes normalized drafts and `CanonicalEntitySnapshot`. Produces exhaustive catalog, limits/allowlist validation, entity-specific validated snapshot index.

**Files:**
- Create: `packages/core/src/operations/catalog.ts`
- Create: `packages/core/src/operations/snapshot.ts`
- Create: `packages/core/src/operations/op-allowlist.test.ts`
- Create: `packages/core/src/operations/snapshot.test.ts`

- [ ] **Step 1: Write RED policy and snapshot tests**

Create `op-allowlist.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateCandidateContract } from './catalog.js';
import { parseAndNormalizeSuggestion } from './normalized.js';
const fact = (visibility: 'writer_safe'|'planner_only') => parseAndNormalizeSuggestion({ schemaVersion:1,tempRef:'factOp',operationType:'fact.create',input:{statement:'X',canonStatus:'draft',visibility,source:{kind:'foundation'}} });
describe('operation contract policy', () => {
  it.each(['beat.write','repair'] as const)('%s rejects planner_only fact.create', (contract) => expect(() => validateCandidateContract(contract,[fact('planner_only')])).toThrowError(expect.objectContaining({code:'OPERATION_NOT_ALLOWED',details:{contract,localRef:'factOp',reason:'writer_safe_required'}})));
  it('foundation permits planner_only facts', () => expect(() => validateCandidateContract('foundation',[fact('planner_only')])).not.toThrow());
  it('enforces total/create/dependency limits before allocation', () => {
    expect(() => validateCandidateContract('foundation',Array.from({length:33},(_,i)=>({...fact('writer_safe'),localRef:`f${i}`,target:{kind:'temporary' as const,entityType:'fact' as const,tempRef:`f${i}`}})))).toThrowError(expect.objectContaining({code:'OPERATION_LIMIT_EXCEEDED'}));
    expect(() => validateCandidateContract('foundation',[{...fact('writer_safe'),dependsOn:Array.from({length:17},(_,i)=>`d${i}`)}])).toThrowError(expect.objectContaining({code:'OPERATION_LIMIT_EXCEEDED'}));
  });
});
```

Create `snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSnapshotIndex } from './snapshot.js';
const base = { entityType:'character',entityId:'c1',exists:true,deleted:false,revision:0,parentId:null } as const;
describe('snapshot validation', () => {
  it('rejects duplicate entity identity', () => expect(() => buildSnapshotIndex([base,{...base,revision:1}])).toThrowError(expect.objectContaining({code:'DUPLICATE_SNAPSHOT'})));
  it.each([
    null,
    7,
    'snapshot',
    {...base,exists:false,deleted:false,revision:0},
    {...base,exists:true,deleted:true,revision:0},
    {...base,entityType:'mystery'},
    {entityType:'character',entityId:'c1',exists:true,deleted:false,parentId:null},
    {...base,entityType:'prose_version',content:'A',contentHash:'a'.repeat(64),candidateId:'c',extractionRunId:'r'},
    {...base,entityType:'roadmap'},
    {...base,entityType:'arc',parentId:'roadmap-1',ordinal:0,nextOrdinal:0},
    {...base,entityType:'chapter',parentId:'arc-1',ordinal:0,narrativeSequence:1,nextOrdinal:0},
    {...base,entityType:'beat',parentId:'chapter-1',narrativeSequence:1},
    {...base,entityType:'fact'},
  ])('rejects malformed, unknown, or entity-incomplete snapshot %# before resolution', (snapshot) => expect(() => buildSnapshotIndex([snapshot] as never)).toThrowError(expect.objectContaining({code:'INVALID_SNAPSHOT'})));
  it('requires every live outline counter and node ordinal',()=>{
    expect(()=>buildSnapshotIndex([{entityType:'roadmap',entityId:'r',exists:true,deleted:false,revision:0,parentId:null,nextOrdinal:0,nextNarrativeSequence:0}])).not.toThrow();
    expect(()=>buildSnapshotIndex([{entityType:'arc',entityId:'a',exists:true,deleted:false,revision:0,parentId:'r',ordinal:0,nextOrdinal:0,nextNarrativeSequence:0}])).not.toThrow();
    expect(()=>buildSnapshotIndex([{entityType:'chapter',entityId:'c',exists:true,deleted:false,revision:0,parentId:'a',ordinal:0,narrativeSequence:0,nextOrdinal:0,nextNarrativeSequence:0}])).not.toThrow();
    expect(()=>buildSnapshotIndex([{entityType:'beat',entityId:'b',exists:true,deleted:false,revision:0,parentId:'c',ordinal:0,narrativeSequence:0}])).not.toThrow();
  });
  it('accepts explicit missing/deleted tombstone only without live fields', () => expect(buildSnapshotIndex([{entityType:'fact',entityId:'gone',exists:false,deleted:true,revision:null,parentId:null}]).size).toBe(1));
});
```

Run: `pnpm --filter @narraza/core exec vitest run src/operations/op-allowlist.test.ts src/operations/snapshot.test.ts`

Expected: FAIL because modules are missing.

- [ ] **Step 2: Implement exhaustive catalog and writer-safe rule**

Create `catalog.ts`:

```ts
import { OperationDomainError } from './errors.js';
import type { CanonicalOperationType, EntityType, OperationContract, OperationRisk } from './entities.js';
import type { NormalizedOperationDraft } from './normalized.js';
interface CatalogEntry { readonly target: EntityType|'outline_node'; readonly mode:'create'|'update'|'append'; readonly risk:OperationRisk; readonly contracts:readonly OperationContract[] }
export const OPERATION_CATALOG = {
  'foundation.update':{target:'foundation',mode:'update',risk:'medium',contracts:['intake','foundation']},
  'character.create':{target:'character',mode:'create',risk:'low',contracts:['foundation']},
  'character.update':{target:'character',mode:'update',risk:'medium',contracts:['foundation']},
  'fact.create':{target:'fact',mode:'create',risk:'high',contracts:['foundation','beat.write','repair']},
  'fact.update':{target:'fact',mode:'update',risk:'high',contracts:['foundation','beat.write','repair']},
  'state.append':{target:'character',mode:'append',risk:'medium',contracts:['beat.write','repair']},
  'belief.append':{target:'character',mode:'append',risk:'medium',contracts:['beat.write','repair']},
  'disclosure.append':{target:'fact',mode:'append',risk:'high',contracts:['beat.write','repair']},
  'reveal.create':{target:'reveal',mode:'create',risk:'high',contracts:['foundation','outline']},
  'reveal.update':{target:'reveal',mode:'update',risk:'high',contracts:['foundation','outline']},
  'breadcrumb.create':{target:'reveal_breadcrumb',mode:'create',risk:'medium',contracts:['outline']},
  'outline.create':{target:'outline_node',mode:'create',risk:'medium',contracts:['outline']},
  'outline.update':{target:'outline_node',mode:'update',risk:'medium',contracts:['outline']},
  'prose.version.create':{target:'prose_version',mode:'create',risk:'low',contracts:['beat.write','repair']},
  'prose.accept':{target:'beat',mode:'update',risk:'high',contracts:['beat.write','repair']},
} as const satisfies Record<CanonicalOperationType,CatalogEntry>;
export const CONTRACT_LIMITS={intake:8,foundation:32,outline:64,'beat.write':32,repair:32} as const;
export const GLOBAL_OPERATION_LIMIT=64, CREATION_LIMIT=32, DEPENDENCY_LIMIT=16;
export function validateCandidateContract(contract:OperationContract,drafts:readonly NormalizedOperationDraft[]):void {
  const cap=Math.min(GLOBAL_OPERATION_LIMIT,CONTRACT_LIMITS[contract]);
  if(drafts.length>cap) throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED','candidate total limit',{contract,limit:cap,actual:drafts.length});
  const refs=new Set<string>(); let creates=0, proseCreates=0, accepts=0;
  for(const draft of drafts){
    if(refs.has(draft.localRef)) throw new OperationDomainError('DUPLICATE_TEMP_REF','duplicate localRef',{contract,localRef:draft.localRef}); refs.add(draft.localRef);
    const entry=OPERATION_CATALOG[draft.operationType];
    if(!entry.contracts.includes(contract as never)) throw new OperationDomainError('OPERATION_NOT_ALLOWED','operation not allowed',{contract,localRef:draft.localRef,operationType:draft.operationType});
    if(draft.dependsOn.length>DEPENDENCY_LIMIT) throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED','dependency limit',{contract,localRef:draft.localRef,limit:DEPENDENCY_LIMIT,actual:draft.dependsOn.length});
    if(entry.mode==='create'){creates+=1;if(draft.operationType==='prose.version.create')proseCreates+=1;}
    if(draft.operationType==='prose.accept') accepts+=1;
    if((contract==='beat.write'||contract==='repair')&&(draft.operationType==='fact.create'||draft.operationType==='fact.update')&&draft.payload.kind===draft.operationType&&draft.payload.visibility==='planner_only') throw new OperationDomainError('OPERATION_NOT_ALLOWED','writer-safe fact required',{contract,localRef:draft.localRef,reason:'writer_safe_required'});
  }
  if(creates>CREATION_LIMIT) throw new OperationDomainError('OPERATION_LIMIT_EXCEEDED','creation limit',{contract,limit:CREATION_LIMIT,actual:creates});
  if((contract==='beat.write'||contract==='repair')&&(proseCreates!==1||accepts!==1)) throw new OperationDomainError('PROSE_ACCEPT_REQUIRED','one prose create and accept required',{contract,proseCreates,accepts});
}
```

- [ ] **Step 3: Implement exact snapshot shape and entity-specific validation**

Create `snapshot.ts`:

```ts
import { OperationDomainError } from './errors.js';
import { SHA256_PATTERN, type CanonicalEntitySnapshot, type EntityType } from './entities.js';
const ENTITY_TYPES=new Set<EntityType>(['foundation','character','fact','character_state','character_belief','fact_disclosure','reveal','reveal_breadcrumb','roadmap','arc','chapter','beat','prose_version']);
const optionalByType:Record<EntityType,readonly string[]>={
  foundation:[],character:[],fact:['factKey'],character_state:[],character_belief:[],fact_disclosure:['factKey'],
  reveal:['targetSequence'],reveal_breadcrumb:[],roadmap:['nextOrdinal','nextNarrativeSequence'],arc:['ordinal','nextOrdinal','nextNarrativeSequence'],
  chapter:['ordinal','narrativeSequence','nextOrdinal','nextNarrativeSequence'],beat:['ordinal','narrativeSequence'],
  prose_version:['candidateId','extractionRunId','content','contentHash','beatId'],
};
const requiredLive:Partial<Record<EntityType,readonly string[]>>={
  fact:['factKey'],roadmap:['nextOrdinal','nextNarrativeSequence'],arc:['parentId','ordinal','nextOrdinal','nextNarrativeSequence'],
  chapter:['parentId','ordinal','narrativeSequence','nextOrdinal','nextNarrativeSequence'],beat:['parentId','ordinal','narrativeSequence'],
  prose_version:['candidateId','extractionRunId','content','contentHash','beatId'],reveal:['targetSequence'],
};
const integerFields=['revision','ordinal','narrativeSequence','nextOrdinal','nextNarrativeSequence','targetSequence'] as const;
const requiredBase=['entityType','entityId','exists','deleted','revision','parentId'] as const;
export const snapshotKey=(type:EntityType,id:string):string=>`${type}\u0000${id}`;
export function buildSnapshotIndex(input:readonly unknown[]):ReadonlyMap<string,CanonicalEntitySnapshot>{
  const out=new Map<string,CanonicalEntitySnapshot>();
  for(const value of input){
    if(typeof value!=='object'||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype) throw new OperationDomainError('INVALID_SNAPSHOT','snapshot must be a plain object');
    const raw=value as Record<string,unknown>;
    if(typeof raw.entityType!=='string'||!ENTITY_TYPES.has(raw.entityType as EntityType)) throw new OperationDomainError('INVALID_SNAPSHOT','unknown snapshot entityType',{entityType:raw.entityType});
    const entityType=raw.entityType as EntityType;const allowed=new Set([...requiredBase,...optionalByType[entityType]]);
    if(requiredBase.some(k=>!Object.hasOwn(raw,k))||Object.keys(raw).some(k=>!allowed.has(k))||typeof raw.entityId!=='string'||raw.entityId.trim()===''||typeof raw.exists!=='boolean'||typeof raw.deleted!=='boolean') throw new OperationDomainError('INVALID_SNAPSHOT','invalid snapshot shape',{entityType,entityId:raw.entityId});
    const s=raw as unknown as CanonicalEntitySnapshot;const live=s.exists&&!s.deleted;
    if(s.exists===s.deleted||(!live&&(s.revision!==null||s.parentId!==null||Object.keys(s).some(k=>!requiredBase.includes(k as never))))) throw new OperationDomainError('INVALID_SNAPSHOT','contradictory existence fields',{entityType:s.entityType,entityId:s.entityId});
    if(live){if(s.revision===null||!Number.isSafeInteger(s.revision)||s.revision<0)throw new OperationDomainError('INVALID_SNAPSHOT','live revision required');for(const key of requiredLive[entityType]??[])if(!Object.hasOwn(s,key)||s[key as keyof CanonicalEntitySnapshot]===undefined||s[key as keyof CanonicalEntitySnapshot]===null)throw new OperationDomainError('INVALID_SNAPSHOT',`missing ${key}`);}
    for(const key of integerFields){const field=s[key];if(field!==undefined&&field!==null&&(!Number.isSafeInteger(field)||field<0))throw new OperationDomainError('INVALID_SNAPSHOT',`invalid ${key}`);}
    if(s.contentHash!==undefined&&(typeof s.contentHash!=='string'||!SHA256_PATTERN.test(s.contentHash)))throw new OperationDomainError('INVALID_SNAPSHOT','invalid content hash');
    const key=snapshotKey(s.entityType,s.entityId);if(out.has(key))throw new OperationDomainError('DUPLICATE_SNAPSHOT','duplicate snapshot identity',{entityType:s.entityType,entityId:s.entityId});out.set(key,Object.freeze({...s}));
  }
  return out;
}
export function requireLiveSnapshot(index:ReadonlyMap<string,CanonicalEntitySnapshot>,type:EntityType,id:string):CanonicalEntitySnapshot{const s=index.get(snapshotKey(type,id));if(!s||!s.exists||s.deleted)throw new OperationDomainError('ENTITY_NOT_FOUND','entity missing or deleted',{entityType:type,entityId:id});return s;}
```

- [ ] **Step 4: Run policy/snapshot/type tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/op-allowlist.test.ts src/operations/snapshot.test.ts
pnpm --filter @narraza/core run test:type:operations
git add packages/core/src/operations
git commit -m "feat(core): enforce operation and snapshot policy"
```

Expected: writer contracts reject both create/update `planner_only` facts; foundation permits them; duplicate/invalid/tombstone snapshot cases pass.

---

### Task 5: Shared fixtures and prose evidence binding

**Global Constraints:** Evidence offsets are UTF-16 code-unit indexes; temporary prose comes only from same candidate declaration; existing prose must match current candidate and extraction run; no substring inference.

**Interfaces:** Consumes snapshot index and normalized prose references. Produces exact canonical evidence and fully defined reusable fixtures.

**Files:**
- Create: `packages/core/src/operations/test-fixtures.ts`
- Create: `packages/core/src/operations/evidence.ts`
- Create: `packages/core/src/operations/evidence-binding.test.ts`

- [ ] **Step 1: Create complete fixture module**

Create `test-fixtures.ts`:

```ts
import type { CanonicalEntitySnapshot, EntityType, ResolutionContext } from './entities.js';
import type { NormalizedOperationDraft } from './normalized.js';
export const HASH_A='559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd', CANDIDATE='candidate-1', RUN='run-1';
export const existing=(entityType:EntityType,entityId:string)=>({kind:'existing' as const,entityType,entityId});
export const temporary=(entityType:EntityType,tempRef:string)=>({kind:'temporary' as const,entityType,tempRef});
export const snapshots:readonly CanonicalEntitySnapshot[]=[
  {entityType:'foundation',entityId:'foundation-1',exists:true,deleted:false,revision:2,parentId:null},
  {entityType:'character',entityId:'char-1',exists:true,deleted:false,revision:3,parentId:null},
  {entityType:'fact',entityId:'fact-1',exists:true,deleted:false,revision:1,parentId:null,factKey:'FK-1'},
  {entityType:'roadmap',entityId:'roadmap-1',exists:true,deleted:false,revision:1,parentId:null,nextOrdinal:1,nextNarrativeSequence:10},
  {entityType:'arc',entityId:'arc-1',exists:true,deleted:false,revision:1,parentId:'roadmap-1',ordinal:0,nextOrdinal:2,nextNarrativeSequence:10},
  {entityType:'chapter',entityId:'chapter-1',exists:true,deleted:false,revision:1,parentId:'arc-1',ordinal:1,narrativeSequence:10,nextOrdinal:3,nextNarrativeSequence:11},
  {entityType:'beat',entityId:'beat-1',exists:true,deleted:false,revision:4,parentId:'chapter-1',ordinal:2,narrativeSequence:10},
  {entityType:'reveal',entityId:'reveal-1',exists:true,deleted:false,revision:1,parentId:null,targetSequence:20},
  {entityType:'prose_version',entityId:'pv-1',exists:true,deleted:false,revision:0,parentId:null,candidateId:CANDIDATE,extractionRunId:RUN,content:'A',contentHash:HASH_A,beatId:'beat-1'},
];
export const context=(contract:ResolutionContext['contract']='beat.write',overrides:Partial<ResolutionContext>={}):ResolutionContext=>({contract,candidateId:CANDIDATE,extractionRunId:RUN,snapshots,allocateId:(type,ref)=>`${type}-${ref}`,allocateOperationId:ref=>`operation-${ref}`,allocateFactKey:ref=>`FK-${ref}`,...overrides});
export const draft=(value:NormalizedOperationDraft):NormalizedOperationDraft=>value;
```

- [ ] **Step 2: Write RED evidence tests**

Create `evidence-binding.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveProseEvidence } from './evidence.js';
import { buildSnapshotIndex } from './snapshot.js';
import { context, existing, temporary } from './test-fixtures.js';
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const prose='A😀B';
const ctx=context('beat.write',{snapshots:[{entityType:'prose_version',entityId:'pv',exists:true,deleted:false,revision:0,parentId:null,candidateId:'candidate-1',extractionRunId:'run-1',content:prose,contentHash:hash(prose),beatId:'beat-1'}]});
it('binds exact UTF-16 range',()=>expect(resolveProseEvidence({proseVersionRef:existing('prose_version','pv'),proseContentHash:hash(prose),startUtf16:1,endUtf16:3},buildSnapshotIndex(ctx.snapshots),new Map(),ctx)).toEqual({proseVersionId:'pv',proseContentHash:hash(prose),startUtf16:1,endUtf16:3}));
it.each([[-1,1],[2,1],[0,5],[0,1.5]])('rejects range %s..%s',(startUtf16,endUtf16)=>expect(()=>resolveProseEvidence({proseVersionRef:existing('prose_version','pv'),proseContentHash:hash(prose),startUtf16,endUtf16},buildSnapshotIndex(ctx.snapshots),new Map(),ctx)).toThrowError(expect.objectContaining({code:'INVALID_PROSE_EVIDENCE_BINDING'})));
it('resolves same-candidate temporary producer',()=>expect(resolveProseEvidence({proseVersionRef:temporary('prose_version','make'),proseContentHash:hash('A'),startUtf16:0,endUtf16:1},buildSnapshotIndex([]),new Map([['make',{id:'prose_version-make',beatId:'beat-1',content:'A',contentHash:hash('A')}]]),context())).toMatchObject({proseVersionId:'prose_version-make'}));
```

Run: `pnpm --filter @narraza/core exec vitest run src/operations/evidence-binding.test.ts`

Expected: FAIL because `evidence.ts` is missing.

- [ ] **Step 3: Implement exact evidence resolver**

Create `evidence.ts`:

```ts
import { OperationDomainError } from './errors.js';
import type { CanonicalEntitySnapshot, ResolutionContext } from './entities.js';
import type { CanonicalProseEvidenceBinding, ProseEvidenceBinding } from './payloads.js';
import { requireLiveSnapshot } from './snapshot.js';
export interface TemporaryProse { readonly id:string; readonly beatId:string; readonly content:string; readonly contentHash:string }
export function resolveProseEvidence(binding:ProseEvidenceBinding,index:ReadonlyMap<string,CanonicalEntitySnapshot>,temporaryProse:ReadonlyMap<string,TemporaryProse>,context:ResolutionContext):CanonicalProseEvidenceBinding{
  const resolved=binding.proseVersionRef.kind==='existing'?(()=>{const s=requireLiveSnapshot(index,'prose_version',binding.proseVersionRef.entityId);if(s.candidateId!==context.candidateId||s.extractionRunId!==context.extractionRunId||s.content===undefined||s.contentHash===undefined)throw new OperationDomainError('INVALID_PROSE_EVIDENCE_BINDING','prose provenance mismatch',{reason:'provenance',proseVersionId:s.entityId,actualCandidateId:s.candidateId,actualExtractionRunId:s.extractionRunId});return{id:s.entityId,content:s.content,contentHash:s.contentHash};})():(()=>{const p=temporaryProse.get(binding.proseVersionRef.tempRef);if(!p)throw new OperationDomainError('UNRESOLVED_TEMP_REF','missing prose producer',{tempRef:binding.proseVersionRef.tempRef});return p;})();
  if(resolved.contentHash!==binding.proseContentHash||!Number.isSafeInteger(binding.startUtf16)||!Number.isSafeInteger(binding.endUtf16)||binding.startUtf16<0||binding.endUtf16<binding.startUtf16||binding.endUtf16>resolved.content.length)throw new OperationDomainError('INVALID_PROSE_EVIDENCE_BINDING','hash or UTF-16 range mismatch');
  return{proseVersionId:resolved.id,proseContentHash:binding.proseContentHash,startUtf16:binding.startUtf16,endUtf16:binding.endUtf16};
}
```

- [ ] **Step 4: Run evidence/type tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/evidence-binding.test.ts
pnpm --filter @narraza/core run test:type:operations
git add packages/core/src/operations
git commit -m "feat(core): bind operation evidence to prose"
```

Expected: emoji range, invalid range/hash/provenance, and same-candidate temporary producer tests pass.

---

### Task 6: Allocation and complete canonical payload resolution

**Global Constraints:** Validate contract/snapshots before allocator calls; create ID derives only from injected allocator; allocated identity collision set starts with every snapshot row including deleted/tombstone and keys by `(entityType, entityId)`; existing live entity required; update revision required; appends use `expectedRevision:null`; no derived value accepted from model.

**Interfaces:** Consumes normalized drafts, catalog, snapshot index, evidence resolver, allocators. Produces unbranded resolved nodes for all 15 operations plus reference edges and extraction evidence IDs.

**Files:**
- Create: `packages/core/src/operations/resolver.ts`
- Create: `packages/core/src/operations/tempref-resolve.test.ts`

- [ ] **Step 1: Write RED 15-branch resolution and failure tests**

Create `tempref-resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperationValues } from './resolver.js';
import { context, HASH_A } from './test-fixtures.js';
const e={proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1};
const raw=[
 {schemaVersion:1,tempRef:'foundation',operationType:'foundation.update',input:{target:{existingId:'foundation-1'},changes:{conflict:'x'}}},
 {schemaVersion:1,tempRef:'charNew',operationType:'character.create',input:{displayName:'N',role:'supporting',identity:null,goal:null,motivation:null,address:null,speechStyle:null}},
 {schemaVersion:1,tempRef:'charUpdate',operationType:'character.update',input:{target:{existingId:'char-1'},displayName:'M',role:'main',identity:null,goal:null,motivation:null,address:null,speechStyle:null}},
 {schemaVersion:1,tempRef:'factNew',operationType:'fact.create',input:{statement:'X',canonStatus:'draft',visibility:'writer_safe',source:{kind:'foundation'}}},
 {schemaVersion:1,tempRef:'factUpdate',operationType:'fact.update',input:{target:{existingId:'fact-1'},statement:'Y',canonStatus:'established',visibility:'writer_safe',source:{kind:'foundation'}}},
 {schemaVersion:1,tempRef:'state',operationType:'state.append',input:{target:{existingId:'char-1'},stateKey:'place',value:'arsip',evidence:e}},
 {schemaVersion:1,tempRef:'belief',operationType:'belief.append',input:{target:{existingId:'char-1'},fact:{existingId:'fact-1'},level:'known',evidence:e}},
 {schemaVersion:1,tempRef:'disclosure',operationType:'disclosure.append',input:{target:{existingId:'fact-1'},event:{kind:'disclose',result:'known'},evidence:e}},
 {schemaVersion:1,tempRef:'revealNew',operationType:'reveal.create',input:{fact:{existingId:'fact-1'},position:{chapter:{existingId:'chapter-1'}},safeDirectives:[]}},
 {schemaVersion:1,tempRef:'revealUpdate',operationType:'reveal.update',input:{target:{existingId:'reveal-1'},fact:{existingId:'fact-1'},position:{chapter:{existingId:'chapter-1'},beat:{existingId:'beat-1'}},safeDirectives:[]}},
 {schemaVersion:1,tempRef:'crumb',operationType:'breadcrumb.create',input:{reveal:{existingId:'reveal-1'},position:{chapter:{existingId:'chapter-1'}},safeDirective:'Kunci'}},
 {schemaVersion:1,tempRef:'roadmap',operationType:'outline.create',input:{node:{kind:'roadmap',title:'Road'}}},
 {schemaVersion:1,tempRef:'chapterUpdate',operationType:'outline.update',input:{target:{existingId:'chapter-1'},node:{kind:'chapter',parent:{existingId:'arc-1'},title:'Bab'}}},
 {schemaVersion:1,tempRef:'prose',operationType:'prose.version.create',input:{beat:{existingId:'beat-1'},content:'A'}},
 {schemaVersion:1,tempRef:'accept',operationType:'prose.accept',input:{target:{existingId:'beat-1'},proseVersion:{tempRef:'prose'}}},
] as const;
it('resolves all 15 payload branches through contract-compatible candidates',()=>{
 const groups=[
  ['intake',[0]],
  ['foundation',[1,2,3,4,8,9]],
  ['outline',[10,11,12]],
  ['beat.write',[5,6,7,13,14]],
 ] as const;
 const nodes=groups.flatMap(([contract,indexes])=>resolveOperationValues(indexes.map(index=>n(raw[index]!)),context(contract)).nodes);
 expect(new Set(nodes.map(x=>x.operationType))).toEqual(new Set(raw.map(x=>x.operationType)));
 expect(nodes.find(x=>x.operationType==='fact.create')?.payload).toMatchObject({factKey:'FK-factNew'});
 expect(nodes.find(x=>x.operationType==='outline.update')?.payload).toMatchObject({node:{parentId:'arc-1',ordinal:1,narrativeSequence:10}});
});
it('rejects invalid allocator output before canonical construction',()=>{
 expect(()=>resolveOperationValues([n(raw[1])],context('foundation',{allocateId:()=>''}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 expect(()=>resolveOperationValues([n(raw[1]),n({...raw[1],tempRef:'charOther'})],context('foundation',{allocateId:()=> 'duplicate'}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 expect(()=>resolveOperationValues([n(raw[3])],context('foundation',{allocateFactKey:()=>''}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 expect(()=>resolveOperationValues([n(raw[1])],context('foundation',{allocateOperationId:()=>''}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
});
it('rejects missing, deleted, unresolved, and duplicate identities',()=>{
 expect(()=>resolveOperationValues([n({...raw[2],input:{...raw[2].input,target:{existingId:'missing'}}})],context('foundation'))).toThrowError(expect.objectContaining({code:'ENTITY_NOT_FOUND'}));
 expect(()=>resolveOperationValues([n({...raw[6],input:{...raw[6].input,fact:{tempRef:'missing'}}})],context())).toThrowError(expect.objectContaining({code:'UNRESOLVED_TEMP_REF'}));
 expect(()=>resolveOperationValues([n(raw[1]),n({...raw[1],operationType:'character.create'})],context('foundation'))).toThrowError(expect.objectContaining({code:'DUPLICATE_TEMP_REF'}));
});
it('rejects revision, parent, chronology, retraction, and beat mismatches',()=>{
 const noRevision=context('foundation',{snapshots:context().snapshots.map(s=>s.entityType==='character'&&s.entityId==='char-1'?{...s,revision:null}:s)});
 expect(()=>resolveOperationValues([n(raw[2])],noRevision)).toThrowError(expect.objectContaining({code:'INVALID_SNAPSHOT'}));
 expect(()=>resolveOperationValues([n({...raw[12],input:{target:{existingId:'chapter-1'},node:{kind:'chapter',parent:{existingId:'roadmap-1'},title:'Bad'}}})],context('outline'))).toThrowError(expect.objectContaining({code:'ENTITY_NOT_FOUND'}));
 const late=context('outline',{snapshots:context().snapshots.map(s=>s.entityType==='reveal'?{...s,targetSequence:10}:s)});
 expect(()=>resolveOperationValues([n(raw[10])],late)).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 expect(()=>resolveOperationValues([n({...raw[7],input:{...raw[7].input,event:{kind:'retract',disclosure:{existingId:'missing'}}}})],context())).toThrowError(expect.objectContaining({code:'ENTITY_NOT_FOUND'}));
 expect(()=>resolveOperationValues([n(raw[13]),n({...raw[14],input:{target:{existingId:'beat-1'},proseVersion:{existingId:'pv-other'}}})],context())).toThrowError(expect.objectContaining({code:'ENTITY_NOT_FOUND'}));
});
it('resolves temporary roadmap to arc to chapter to beat and allocates siblings in semantic localRef order',()=>{
 const outline=[
  n({schemaVersion:1,tempRef:'beatB',operationType:'outline.create',input:{node:{kind:'beat',parent:{tempRef:'chapter'},title:'B',purpose:'B'}}}),
  n({schemaVersion:1,tempRef:'road',operationType:'outline.create',input:{node:{kind:'roadmap',title:'Road'}}}),
  n({schemaVersion:1,tempRef:'chapter',operationType:'outline.create',input:{node:{kind:'chapter',parent:{tempRef:'arc'},title:'Chapter'}}}),
  n({schemaVersion:1,tempRef:'beatA',operationType:'outline.create',input:{node:{kind:'beat',parent:{tempRef:'chapter'},title:'A',purpose:'A'}}}),
  n({schemaVersion:1,tempRef:'arc',operationType:'outline.create',input:{node:{kind:'arc',parent:{tempRef:'road'},title:'Arc'}}}),
  n({schemaVersion:1,tempRef:'chapterExisting',operationType:'outline.create',input:{node:{kind:'chapter',parent:{existingId:'arc-1'},title:'Existing sibling'}}}),
 ] as const;
 const project=(input:readonly (typeof outline)[number][])=>resolveOperationValues(input,context('outline')).nodes.map(x=>[x.localRef,x.payload]);
 const expected=project(outline);
 expect(project([...outline].reverse())).toEqual(expected);
 expect(expected).toEqual(expect.arrayContaining([
  ['arc',expect.objectContaining({node:expect.objectContaining({parentId:'roadmap-road',ordinal:0})})],
  ['chapter',expect.objectContaining({node:expect.objectContaining({parentId:'arc-arc',ordinal:0,narrativeSequence:0})})],
  ['beatA',expect.objectContaining({node:expect.objectContaining({parentId:'chapter-chapter',ordinal:0,narrativeSequence:0})})],
  ['beatB',expect.objectContaining({node:expect.objectContaining({parentId:'chapter-chapter',ordinal:1,narrativeSequence:1})})],
  ['chapterExisting',expect.objectContaining({node:expect.objectContaining({parentId:'arc-1',ordinal:2,narrativeSequence:10})})],
 ]));
});
it('preserves outline.update target ordinal instead of parent nextOrdinal',()=>{
 const updated=resolveOperationValues([n(raw[12])],context('outline')).nodes[0]!;
 expect(updated.payload).toMatchObject({node:{parentId:'arc-1',ordinal:1,narrativeSequence:10}});
});
it('allocates each temporary factKey once, reuses it, and stays permutation-stable',()=>{
 const calls:string[]=[];const drafts=[
  n({schemaVersion:1,tempRef:'factA',operationType:'fact.create',input:{statement:'A',canonStatus:'draft',visibility:'writer_safe',source:{kind:'foundation'}}}),
  n({schemaVersion:1,tempRef:'beliefA',operationType:'belief.append',input:{target:{existingId:'char-1'},fact:{tempRef:'factA'},level:'known',evidence:e}}),
 ] as const;
 const candidate=[...drafts,n(raw[13]),n(raw[14])];
 const run=(input:readonly (typeof candidate)[number][])=>resolveOperationValues(input,context('beat.write',{allocateFactKey:ref=>{calls.push(ref);return `FK-${ref}`;}})).nodes.map(x=>x.payload);
 const first=run(candidate);expect(calls).toEqual(['factA']);calls.length=0;expect(run([...candidate].reverse())).toEqual(first);expect(calls).toEqual(['factA']);expect(first).toEqual(expect.arrayContaining([expect.objectContaining({kind:'fact.create',factKey:'FK-factA'}),expect.objectContaining({kind:'belief.append',beliefKey:'FK-factA'})]));
});
it('rejects duplicate precomputed factKeys before payload resolution',()=>{
 const facts=[n(raw[3]),n({...raw[3],tempRef:'factOther'})];let calls=0;
 expect(()=>resolveOperationValues(facts,context('foundation',{allocateFactKey:()=>{calls+=1;return 'duplicate';}}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 expect(calls).toBe(2);
 expect(()=>resolveOperationValues([n(raw[3])],context('foundation',{allocateFactKey:()=> 'FK-1'}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
});
it('uses temporary chapter and beat metadata for reveal and breadcrumb positions across permutations',()=>{
 const outline=[
  n({schemaVersion:1,tempRef:'chapterTemp',operationType:'outline.create',input:{node:{kind:'chapter',parent:{existingId:'arc-1'},title:'Temp chapter'}}}),
  n({schemaVersion:1,tempRef:'beatTemp',operationType:'outline.create',input:{node:{kind:'beat',parent:{tempRef:'chapterTemp'},title:'Temp beat',purpose:'Position'}}}),
 ] as const;
 const reveal=n({schemaVersion:1,tempRef:'revealTemp',operationType:'reveal.create',input:{fact:{existingId:'fact-1'},position:{chapter:{tempRef:'chapterTemp'},beat:{tempRef:'beatTemp'}},safeDirectives:[]}});
 const breadcrumb=n({schemaVersion:1,tempRef:'crumbTemp',operationType:'breadcrumb.create',input:{reveal:{existingId:'reveal-1'},position:{chapter:{tempRef:'chapterTemp'},beat:{tempRef:'beatTemp'}},safeDirective:'Earlier'}});
 const chapterReveal=n({schemaVersion:1,tempRef:'chapterReveal',operationType:'reveal.create',input:{fact:{existingId:'fact-1'},position:{chapter:{tempRef:'chapterTemp'}},safeDirectives:[]}});
 const candidate=[...outline,reveal,breadcrumb,chapterReveal];
 const project=(input:readonly (typeof candidate)[number][])=>resolveOperationValues(input,context('outline')).nodes.filter(x=>['revealTemp','crumbTemp','chapterReveal'].includes(x.localRef)).map(x=>[x.localRef,x.payload]);
 const expected=project(candidate);
 expect(project([...candidate].reverse())).toEqual(expected);
 expect(expected).toEqual(expect.arrayContaining([
  ['revealTemp',expect.objectContaining({chapterId:'chapter-chapterTemp',beatId:'beat-beatTemp',targetSequence:0})],
  ['crumbTemp',expect.objectContaining({chapterId:'chapter-chapterTemp',beatId:'beat-beatTemp',sequence:0})],
  ['chapterReveal',expect.objectContaining({chapterId:'chapter-chapterTemp',targetSequence:10})],
 ]));
});
it('seeds create collision identities from live and tombstone snapshots while allowing same raw ID across entity types',()=>{
 const tombstone={entityType:'character' as const,entityId:'reserved',exists:false,deleted:true,revision:null,parentId:null};
 expect(()=>resolveOperationValues([n(raw[1])],context('foundation',{snapshots:[...context().snapshots,tombstone],allocateId:()=> 'reserved'}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION',details:expect.objectContaining({entityType:'character',entityId:'reserved'})}));
 expect(()=>resolveOperationValues([n(raw[1])],context('foundation',{allocateId:()=> 'char-1'}))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));
 const crossType=resolveOperationValues([n(raw[1])],context('foundation',{allocateId:()=> 'fact-1'}));
 expect(crossType.nodes[0]).toMatchObject({targetEntityType:'character',targetId:'fact-1'});
});
```

Run: `pnpm --filter @narraza/core exec vitest run src/operations/tempref-resolve.test.ts`

Expected: FAIL because resolver module is missing.

- [ ] **Step 2: Implement allocation/reference helpers and every canonical branch**

Create `resolver.ts`. This is complete branch behavior; Task 7 adds ordering and final branding without changing payload rules.

```ts
import { sha256Hex } from '../dependency/canonical-json.js';
import { brandCanonicalOperation, type UnbrandedCanonicalOperation } from './canonical.js';
import { OPERATION_CATALOG, validateCandidateContract } from './catalog.js';
import { resolveProseEvidence, type TemporaryProse } from './evidence.js';
import { OperationDomainError } from './errors.js';
import { compareCodeUnits, type CanonicalEntitySnapshot, type EntityType, type Ref, type ResolutionContext } from './entities.js';
import type { NormalizedOperationDraft } from './normalized.js';
import type { CanonicalOperationPayload, CanonicalProseEvidenceBinding } from './payloads.js';
import { buildSnapshotIndex, requireLiveSnapshot, snapshotKey } from './snapshot.js';
export interface ResolutionEdge { readonly before:string; readonly after:string }
export interface ResolvedValueNode extends Omit<UnbrandedCanonicalOperation,'ordinal'> { readonly localRef:string; readonly ordinal:0; readonly referenceEdges:readonly ResolutionEdge[]; readonly evidenceProseVersionIds:readonly string[] }
export interface ResolutionValues { readonly nodes:readonly ResolvedValueNode[]; readonly explicitEdges:readonly ResolutionEdge[] }
const requiredRevision=(s:CanonicalEntitySnapshot):number=>{if(s.revision===null)throw new OperationDomainError('REVISION_REQUIRED','revision required',{entityType:s.entityType,entityId:s.entityId});return s.revision;};
const refId=(ref:Ref,index:ReadonlyMap<string,CanonicalEntitySnapshot>,ids:ReadonlyMap<string,{type:EntityType;id:string}>,consumer:string,edges:ResolutionEdge[]):string=>{if(ref.kind==='existing')return requireLiveSnapshot(index,ref.entityType,ref.entityId).entityId;const item=ids.get(ref.tempRef);if(!item||item.type!==ref.entityType)throw new OperationDomainError('UNRESOLVED_TEMP_REF','unresolved temporary reference',{localRef:consumer,tempRef:ref.tempRef,entityType:ref.entityType});edges.push({before:ref.tempRef,after:consumer});return item.id;};
const sequenceForEvidence=(e:CanonicalProseEvidenceBinding,index:ReadonlyMap<string,CanonicalEntitySnapshot>,temporaryProse:ReadonlyMap<string,TemporaryProse>):number=>{const beatId=temporaryProse.values().find(p=>p.id===e.proseVersionId)?.beatId??requireLiveSnapshot(index,'prose_version',e.proseVersionId).beatId!;return requireLiveSnapshot(index,'beat',beatId).narrativeSequence!;};
type OutlineEntityType='roadmap'|'arc'|'chapter'|'beat';
interface ResolvedOutlineMetadata { readonly entityType:OutlineEntityType;readonly entityId:string;readonly parentId?:string;readonly ordinal?:number;readonly narrativeSequence?:number }
interface TemporaryOutlineMetadata { readonly byLocalRef:ReadonlyMap<string,ResolvedOutlineMetadata>;readonly byResolvedIdentity:ReadonlyMap<string,ResolvedOutlineMetadata> }
const outlineCounterKey=(type:EntityType,id:string)=>snapshotKey(type,id);
function precomputeOutlineCreates(drafts:readonly NormalizedOperationDraft[],index:ReadonlyMap<string,CanonicalEntitySnapshot>,ids:ReadonlyMap<string,{type:EntityType;id:string}>):TemporaryOutlineMetadata{
 const pending=new Map(drafts.filter((d):d is NormalizedOperationDraft&{readonly operationType:'outline.create';readonly payload:Extract<NormalizedOperationDraft['payload'],{kind:'outline.create'}>}=>d.operationType==='outline.create'&&d.payload.kind==='outline.create').map(d=>[d.localRef,d]));
 const byLocalRef=new Map<string,ResolvedOutlineMetadata>(),byResolvedIdentity=new Map<string,ResolvedOutlineMetadata>(),nextOrdinal=new Map<string,number>(),nextNarrative=new Map<string,number>();
 const counters=(type:EntityType,id:string,temporary:boolean)=>{const key=outlineCounterKey(type,id);if(!nextOrdinal.has(key)){if(temporary){nextOrdinal.set(key,0);nextNarrative.set(key,0);}else{const parent=requireLiveSnapshot(index,type,id);nextOrdinal.set(key,parent.nextOrdinal!);nextNarrative.set(key,parent.nextNarrativeSequence!);}}return key;};
 const expose=(localRef:string,metadata:ResolvedOutlineMetadata)=>{byLocalRef.set(localRef,metadata);byResolvedIdentity.set(snapshotKey(metadata.entityType,metadata.entityId),metadata);};
 while(pending.size>0){
  const ready=[...pending.values()].filter(d=>d.payload.node.kind==='roadmap'||d.payload.node.parent.kind==='existing'||byLocalRef.has(d.payload.node.parent.tempRef)).sort((a,b)=>compareCodeUnits(a.target.entityType,b.target.entityType)||compareCodeUnits(a.localRef,b.localRef));
  if(ready.length===0)throw new OperationDomainError('UNRESOLVED_TEMP_REF','temporary outline parent chain cannot be resolved',{localRefs:[...pending.keys()].sort(compareCodeUnits)});
  for(const d of ready){const node=d.payload.node;const entityId=ids.get(d.localRef)!.id;if(node.kind==='roadmap'){expose(d.localRef,{entityType:'roadmap',entityId});counters('roadmap',entityId,true);pending.delete(d.localRef);continue;}const parentId=node.parent.kind==='existing'?requireLiveSnapshot(index,node.parent.entityType,node.parent.entityId).entityId:byLocalRef.get(node.parent.tempRef)!.entityId;const key=counters(node.parent.entityType,parentId,node.parent.kind==='temporary');const ordinal=nextOrdinal.get(key)!;nextOrdinal.set(key,ordinal+1);if(node.kind==='arc')expose(d.localRef,{entityType:node.kind,entityId,parentId,ordinal});else{const narrativeSequence=nextNarrative.get(key)!;nextNarrative.set(key,narrativeSequence+1);expose(d.localRef,{entityType:node.kind,entityId,parentId,ordinal,narrativeSequence});}counters(node.kind,entityId,true);pending.delete(d.localRef);}
 }
 return{byLocalRef,byResolvedIdentity};
}
const outlinePosition=(ref:Ref,index:ReadonlyMap<string,CanonicalEntitySnapshot>,temporaryOutline:TemporaryOutlineMetadata,ids:ReadonlyMap<string,{type:EntityType;id:string}>,consumer:string,edges:ResolutionEdge[]):{readonly entityId:string;readonly narrativeSequence:number}=>{
 const entityId=refId(ref,index,ids,consumer,edges);
 if(ref.kind==='existing'){const snapshot=requireLiveSnapshot(index,ref.entityType,entityId);return{entityId,narrativeSequence:snapshot.narrativeSequence!};}
 const metadata=temporaryOutline.byLocalRef.get(ref.tempRef)??temporaryOutline.byResolvedIdentity.get(snapshotKey(ref.entityType,entityId));
 if(metadata===undefined||metadata.entityType!==ref.entityType||metadata.narrativeSequence===undefined)throw new OperationDomainError('UNRESOLVED_TEMP_REF','temporary outline position metadata missing',{localRef:consumer,tempRef:ref.tempRef,entityType:ref.entityType,entityId});
 return{entityId:metadata.entityId,narrativeSequence:metadata.narrativeSequence};
};
export function resolveOperationValues(drafts:readonly NormalizedOperationDraft[],context:ResolutionContext):ResolutionValues{
 validateCandidateContract(context.contract,drafts);const index=buildSnapshotIndex(context.snapshots);const semanticDrafts=[...drafts].sort((a,b)=>compareCodeUnits(a.operationType,b.operationType)||compareCodeUnits(a.target.entityType,b.target.entityType)||compareCodeUnits(a.localRef,b.localRef));const ids=new Map<string,{type:EntityType;id:string}>();const allocatedIdentityKey=(type:EntityType,id:string)=>snapshotKey(type,id);const usedIdentities=new Set([...index.values()].map(s=>allocatedIdentityKey(s.entityType,s.entityId))),usedOperationIds=new Set<string>(),usedFactKeys=new Set([...index.values()].filter(s=>s.entityType==='fact'&&s.exists&&!s.deleted).map(s=>s.factKey!));
 for(const d of semanticDrafts){if(OPERATION_CATALOG[d.operationType].mode!=='create')continue;const id=context.allocateId(d.target.entityType,d.localRef);const identity=typeof id==='string'?allocatedIdentityKey(d.target.entityType,id):'';if(typeof id!=='string'||id.trim()===''||usedIdentities.has(identity))throw new OperationDomainError('INVALID_SUGGESTION','allocator returned invalid/duplicate entity identity',{localRef:d.localRef,entityType:d.target.entityType,entityId:id});usedIdentities.add(identity);ids.set(d.localRef,{type:d.target.entityType,id});}
 const factKeyByLocalRef=new Map<string,string>();for(const d of semanticDrafts){if(d.operationType!=='fact.create')continue;const factKey=context.allocateFactKey(d.localRef);if(typeof factKey!=='string'||factKey.trim()===''||usedFactKeys.has(factKey))throw new OperationDomainError('INVALID_SUGGESTION','invalid/duplicate factKey',{localRef:d.localRef});usedFactKeys.add(factKey);factKeyByLocalRef.set(d.localRef,factKey);}
 const temporaryOutline=precomputeOutlineCreates(semanticDrafts,index,ids);
 const temporaryProse=new Map<string,TemporaryProse>();for(const d of semanticDrafts)if(d.operationType==='prose.version.create'&&d.payload.kind==='prose.version.create'){const edges:ResolutionEdge[]=[];const beatId=refId(d.payload.beat,index,ids,d.localRef,edges);const id=ids.get(d.localRef)!.id;temporaryProse.set(d.localRef,{id,beatId,content:d.payload.content,contentHash:sha256Hex(d.payload.content)});}
 const nodes=semanticDrafts.map((d):ResolvedValueNode=>{const edges:ResolutionEdge[]=[];const targetId=d.target.kind==='existing'?requireLiveSnapshot(index,d.target.entityType,d.target.entityId).entityId:refId(d.target,index,ids,d.localRef,edges);const targetSnapshot=d.target.kind==='existing'?requireLiveSnapshot(index,d.target.entityType,targetId):null;const operationId=context.allocateOperationId(d.localRef);if(typeof operationId!=='string'||operationId.trim()===''||usedOperationIds.has(operationId))throw new OperationDomainError('INVALID_SUGGESTION','invalid/duplicate operationId');usedOperationIds.add(operationId);let payload:CanonicalOperationPayload;let expectedRevision:number|null=null;const evidenceIds:string[]=[];
 const evidence=(value:Parameters<typeof resolveProseEvidence>[0])=>{const e=resolveProseEvidence(value,index,temporaryProse,context);evidenceIds.push(e.proseVersionId);if(value.proseVersionRef.kind==='temporary')edges.push({before:value.proseVersionRef.tempRef,after:d.localRef});return e;};
 switch(d.operationType){
  case'foundation.update':if(d.payload.kind!=='foundation.update')throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=requiredRevision(targetSnapshot!);payload=d.payload;break;
  case'character.create':case'character.update':if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=d.operationType==='character.update'?requiredRevision(targetSnapshot!):null;payload=d.payload;break;
  case'fact.create':case'fact.update':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=d.operationType==='fact.update'?requiredRevision(targetSnapshot!):null;const factKey=d.operationType==='fact.create'?factKeyByLocalRef.get(d.localRef)!:targetSnapshot!.factKey!;payload={kind:d.operationType,factKey,statement:d.payload.statement,canonStatus:d.payload.canonStatus,visibility:d.payload.visibility,source:d.payload.source.kind==='foundation'?{kind:'foundation'}:{kind:'prose',evidence:evidence(d.payload.source.evidence)}};break;}
  case'state.append':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');const e=evidence(d.payload.evidence);payload={kind:d.operationType,effectiveSequence:sequenceForEvidence(e,index,temporaryProse),stateKey:d.payload.stateKey,value:d.payload.value,evidence:e};break;}
  case'belief.append':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');const factId=refId(d.payload.fact,index,ids,d.localRef,edges);const factKey=d.payload.fact.kind==='existing'?requireLiveSnapshot(index,'fact',factId).factKey!:factKeyByLocalRef.get(d.payload.fact.tempRef);if(factKey===undefined)throw new OperationDomainError('UNRESOLVED_TEMP_REF','missing fact producer',{tempRef:d.payload.fact.tempRef});const e=evidence(d.payload.evidence);const base={kind:d.operationType,factId,beliefKey:factKey,effectiveSequence:sequenceForEvidence(e,index,temporaryProse),level:d.payload.level,evidence:e} as const;payload=d.payload.downgradeReason===undefined?base:{...base,downgradeReason:d.payload.downgradeReason};break;}
  case'disclosure.append':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');const e=evidence(d.payload.evidence);const event=d.payload.event.kind==='disclose'?d.payload.event:{kind:'retract' as const,disclosureId:refId(d.payload.event.disclosure,index,ids,d.localRef,edges)};payload={kind:d.operationType,effectiveSequence:sequenceForEvidence(e,index,temporaryProse),event,evidence:e};break;}
  case'reveal.create':case'reveal.update':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=d.operationType==='reveal.update'?requiredRevision(targetSnapshot!):null;const factId=refId(d.payload.fact,index,ids,d.localRef,edges),chapter=outlinePosition(d.payload.position.chapter,index,temporaryOutline,ids,d.localRef,edges);const beat=d.payload.position.beat===undefined?undefined:outlinePosition(d.payload.position.beat,index,temporaryOutline,ids,d.localRef,edges);const targetSequence=beat?.narrativeSequence??chapter.narrativeSequence;payload=beat===undefined?{kind:d.operationType,factId,chapterId:chapter.entityId,targetSequence,safeDirectives:d.payload.safeDirectives}:{kind:d.operationType,factId,chapterId:chapter.entityId,beatId:beat.entityId,targetSequence,safeDirectives:d.payload.safeDirectives};break;}
  case'breadcrumb.create':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');const revealId=refId(d.payload.reveal,index,ids,d.localRef,edges),chapter=outlinePosition(d.payload.position.chapter,index,temporaryOutline,ids,d.localRef,edges);const beat=d.payload.position.beat===undefined?undefined:outlinePosition(d.payload.position.beat,index,temporaryOutline,ids,d.localRef,edges);const sequence=beat?.narrativeSequence??chapter.narrativeSequence;const revealSequence=d.payload.reveal.kind==='existing'?requireLiveSnapshot(index,'reveal',revealId).targetSequence!:Number.MAX_SAFE_INTEGER;if(sequence>=revealSequence)throw new OperationDomainError('INVALID_SUGGESTION','breadcrumb must precede reveal');payload=beat===undefined?{kind:d.operationType,revealId,chapterId:chapter.entityId,sequence,safeDirective:d.payload.safeDirective}:{kind:d.operationType,revealId,chapterId:chapter.entityId,beatId:beat.entityId,sequence,safeDirective:d.payload.safeDirective};break;}
  case'outline.create':case'outline.update':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=d.operationType==='outline.update'?requiredRevision(targetSnapshot!):null;const node=d.payload.node;if(node.kind==='roadmap')payload={kind:d.operationType,node};else{const parentId=refId(node.parent,index,ids,d.localRef,edges);if(d.operationType==='outline.update'&&targetSnapshot!.parentId!==parentId)throw new OperationDomainError('INVALID_SUGGESTION','outline parent identity changed');const metadata=d.operationType==='outline.create'?temporaryOutline.byLocalRef.get(d.localRef):undefined;const ordinal=d.operationType==='outline.update'?targetSnapshot!.ordinal!:metadata!.ordinal!;if(node.kind==='arc')payload={kind:d.operationType,node:{kind:node.kind,parentId,title:node.title,ordinal}};else{const narrativeSequence=d.operationType==='outline.update'?targetSnapshot!.narrativeSequence!:metadata!.narrativeSequence!;payload=node.kind==='chapter'?{kind:d.operationType,node:{kind:node.kind,parentId,title:node.title,ordinal,narrativeSequence}}:{kind:d.operationType,node:{kind:node.kind,parentId,title:node.title,purpose:node.purpose,ordinal,narrativeSequence}};}}break;}
  case'prose.version.create':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');const p=temporaryProse.get(d.localRef)!;payload={kind:d.operationType,beatId:p.beatId,content:p.content,contentHash:p.contentHash};break;}
  case'prose.accept':{if(d.payload.kind!==d.operationType)throw new OperationDomainError('INVALID_SUGGESTION','payload mismatch');expectedRevision=requiredRevision(targetSnapshot!);const proseVersionId=refId(d.payload.proseVersion,index,ids,d.localRef,edges);const beatId=d.payload.proseVersion.kind==='temporary'?temporaryProse.get(d.payload.proseVersion.tempRef)!.beatId:requireLiveSnapshot(index,'prose_version',proseVersionId).beatId!;if(beatId!==targetId)throw new OperationDomainError('INVALID_SUGGESTION','accepted prose belongs to different beat');payload={kind:d.operationType,proseVersionId};break;}
 }
 return{schemaVersion:1,operationId,ordinal:0,operationType:d.operationType,targetEntityType:d.target.entityType,targetId,expectedRevision,risk:OPERATION_CATALOG[d.operationType].risk,payload,localRef:d.localRef,referenceEdges:edges,evidenceProseVersionIds:evidenceIds};});
 return{nodes,explicitEdges:drafts.flatMap(d=>d.dependsOn.map(before=>({before,after:d.localRef})))};
}
export const brandResolvedNode=(node:ResolvedValueNode,ordinal:number)=>brandCanonicalOperation({schemaVersion:1,operationId:node.operationId,ordinal,operationType:node.operationType,targetEntityType:node.targetEntityType,targetId:node.targetId,expectedRevision:node.expectedRevision,risk:node.risk,payload:node.payload});
```

- [ ] **Step 3: Add exact cross-entity identity assertions**

After temporary prose precomputation, precompute temporary reveal sequences:

```ts
const revealSequenceByLocalRef=new Map<string,number>();
for(const d of drafts){
 if(d.operationType!=='reveal.create'||d.payload.kind!=='reveal.create')continue;
 const edges:ResolutionEdge[]=[];
 const chapter=outlinePosition(d.payload.position.chapter,index,temporaryOutline,ids,d.localRef,edges);
 const beat=d.payload.position.beat===undefined?undefined:outlinePosition(d.payload.position.beat,index,temporaryOutline,ids,d.localRef,edges);
 revealSequenceByLocalRef.set(d.localRef,beat?.narrativeSequence??chapter.narrativeSequence);
}
```

Replace disclosure retraction event construction with:

```ts
let event:{readonly kind:'disclose';readonly result:'suspected'|'known'}|{readonly kind:'retract';readonly disclosureId:string};
if(d.payload.event.kind==='disclose') event=d.payload.event;
else {
 const disclosureId=refId(d.payload.event.disclosure,index,ids,d.localRef,edges);
 const disclosure=requireLiveSnapshot(index,'fact_disclosure',disclosureId);
 const targetFactKey=d.target.kind==='existing'?targetSnapshot!.factKey!:factKeyByLocalRef.get(d.target.tempRef);
 if(targetFactKey===undefined) throw new OperationDomainError('UNRESOLVED_TEMP_REF','missing fact producer',{tempRef:d.target.tempRef});
 if(disclosure.factKey!==targetFactKey) throw new OperationDomainError('INVALID_SUGGESTION','retraction belongs to different fact');
 event={kind:'retract',disclosureId};
}
```

At start of `outline.create/update` branch, before node payload construction, add:

```ts
if(d.operationType==='outline.update'){
 if(targetSnapshot!.entityType!==d.payload.node.kind) throw new OperationDomainError('INVALID_SUGGESTION','outline target type mismatch');
 if(d.payload.node.kind==='roadmap'&&targetSnapshot!.parentId!==null) throw new OperationDomainError('INVALID_SUGGESTION','roadmap cannot have parent');
}
```

Immediately after resolving non-roadmap `parentId`, add:

```ts
if(d.operationType==='outline.update'&&targetSnapshot!.parentId!==parentId) throw new OperationDomainError('INVALID_SUGGESTION','outline parent identity changed');
```

Replace breadcrumb reveal sequence derivation with:

```ts
const revealSequence=d.payload.reveal.kind==='existing'
 ? requireLiveSnapshot(index,'reveal',revealId).targetSequence!
 : revealSequenceByLocalRef.get(d.payload.reveal.tempRef);
if(revealSequence===undefined) throw new OperationDomainError('UNRESOLVED_TEMP_REF','missing reveal producer',{tempRef:d.payload.reveal.tempRef});
if(sequence>=revealSequence) throw new OperationDomainError('INVALID_SUGGESTION','breadcrumb must precede reveal');
```

At start of `prose.accept` branch, add:

```ts
if((context.contract==='beat.write'||context.contract==='repair')&&d.payload.proseVersion.kind!=='temporary') throw new OperationDomainError('PROSE_ACCEPT_REQUIRED','accept must target candidate prose');
```

- [ ] **Step 4: Run resolver/evidence/payload/type tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/tempref-resolve.test.ts src/operations/evidence-binding.test.ts src/operations/payload-catalog.test.ts
pnpm --filter @narraza/core run test:type:operations
pnpm --filter @narraza/core build
git add packages/core/src/operations
git commit -m "feat(core): resolve all canonical operation values"
```

Expected: all 15 branches pass; temporary chapter/beat positions resolve from precomputed metadata across permutations; live and tombstone identity collisions reject while same raw ID across entity types passes; every focused invalid snapshot/ref/allocator case fails with exact code; no normalized `Ref`, `localRef`, candidate/run ID, or allocator input appears in canonical payload.

---

### Task 7: Dependency DAG, stable topological sort, and prose accept ordering

**Global Constraints:** Sort independent of input order and `Set` insertion order; duplicate edges deduplicated; only actual cycle members reported; all non-accept nodes precede accept.

**Interfaces:** Consumes resolved value nodes, explicit/reference edges. Produces stable ordered branded operations with contiguous ordinals.

**Files:**
- Create: `packages/core/src/operations/topo-sort.ts`
- Modify: `packages/core/src/operations/resolver.ts`
- Create: `packages/core/src/operations/operation-topo-sort.test.ts`
- Create: `packages/core/src/operations/prose-accept-order.test.ts`

- [ ] **Step 1: Write RED graph and accept tests**

Create `operation-topo-sort.test.ts`:

```ts
import { describe,expect,it } from 'vitest';
import { stableTopologicalSort } from './topo-sort.js';
const nodes=[{localRef:'b',operationType:'fact.create',targetEntityType:'fact',targetId:'2'},{localRef:'a',operationType:'character.create',targetEntityType:'character',targetId:'1'},{localRef:'c',operationType:'belief.append',targetEntityType:'character',targetId:'1'}] as const;
it('sorts ready queue by operationType/entityType/targetId/localRef',()=>expect(stableTopologicalSort(nodes,[]).map(x=>x.localRef)).toEqual(['a','c','b']));
it('deduplicates edges and rejects missing/self/cycle stably',()=>{expect(stableTopologicalSort(nodes,[{before:'a',after:'c'},{before:'a',after:'c'}]).map(x=>x.localRef)).toEqual(['a','c','b']);expect(()=>stableTopologicalSort(nodes,[{before:'x',after:'a'}])).toThrowError(expect.objectContaining({code:'INVALID_DEPENDENCY'}));expect(()=>stableTopologicalSort(nodes,[{before:'a',after:'a'}])).toThrowError(expect.objectContaining({code:'INVALID_DEPENDENCY'}));expect(()=>stableTopologicalSort(nodes,[{before:'a',after:'c'},{before:'c',after:'a'}])).toThrowError(expect.objectContaining({code:'DEPENDENCY_CYCLE',details:{cycleNodeIds:['a','c']}}));});
```

Create `prose-accept-order.test.ts`:

```ts
import { expect,it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperations } from './resolver.js';
import { context,HASH_A } from './test-fixtures.js';
const suggestions=[n({schemaVersion:1,tempRef:'accept',operationType:'prose.accept',input:{target:{existingId:'beat-1'},proseVersion:{tempRef:'prose'}}}),n({schemaVersion:1,tempRef:'prose',operationType:'prose.version.create',input:{beat:{existingId:'beat-1'},content:'A'}}),n({schemaVersion:1,tempRef:'fact',operationType:'fact.create',input:{statement:'X',canonStatus:'draft',visibility:'writer_safe',source:{kind:'prose',evidence:{proseVersionRef:{tempRef:'prose'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}}}})];
it.each(['beat.write','repair'] as const)('%s keeps sole accept last',(contract)=>expect(resolveOperations([...suggestions].reverse(),context(contract,{repairBinding:contract==='repair'?{sourceProseVersionId:'old',repairedProseVersionId:'prose_version-prose',extractionSourceProseVersionId:'prose_version-prose'}:undefined})).operations.at(-1)?.operationType).toBe('prose.accept'));
```

Run focused tests. Expected: FAIL because topo module/final resolver is missing.

- [ ] **Step 2: Implement deterministic graph validation and Kahn sort**

Create `topo-sort.ts`:

```ts
import { OperationDomainError } from './errors.js';
import { compareCodeUnits, type CanonicalOperationType, type EntityType } from './entities.js';
export interface OperationGraphEdge { readonly before:string; readonly after:string }
export interface SortableOperationNode { readonly localRef:string; readonly operationType:CanonicalOperationType; readonly targetEntityType:EntityType; readonly targetId:string }
const compare=(a:SortableOperationNode,b:SortableOperationNode)=>compareCodeUnits(a.operationType,b.operationType)||compareCodeUnits(a.targetEntityType,b.targetEntityType)||compareCodeUnits(a.targetId,b.targetId)||compareCodeUnits(a.localRef,b.localRef);
export function stableTopologicalSort<T extends SortableOperationNode>(nodes:readonly T[],edges:readonly OperationGraphEdge[]):readonly T[]{
 const byId=new Map(nodes.map(n=>[n.localRef,n]));if(byId.size!==nodes.length)throw new OperationDomainError('DUPLICATE_TEMP_REF','duplicate graph node');const outgoing=new Map(nodes.map(n=>[n.localRef,new Set<string>()]));const indegree=new Map(nodes.map(n=>[n.localRef,0]));
 for(const e of edges){if(!byId.has(e.before)||!byId.has(e.after)||e.before===e.after)throw new OperationDomainError('INVALID_DEPENDENCY','invalid graph edge',{before:e.before,after:e.after});const set=outgoing.get(e.before)!;if(!set.has(e.after)){set.add(e.after);indegree.set(e.after,indegree.get(e.after)!+1);}}
 const ready=nodes.filter(n=>indegree.get(n.localRef)===0).sort(compare),result:T[]=[];while(ready.length){const n=ready.shift()!;result.push(n);for(const id of [...outgoing.get(n.localRef)!].sort(compareCodeUnits)){indegree.set(id,indegree.get(id)!-1);if(indegree.get(id)===0){ready.push(byId.get(id)!);ready.sort(compare);}}}
 if(result.length!==nodes.length){const residual=[...indegree].filter(([,v])=>v>0).map(([id])=>id).sort(compareCodeUnits);const cycle=new Set<string>(),state=new Map<string,0|1|2>(),stack:string[]=[];const visit=(id:string)=>{state.set(id,1);stack.push(id);for(const next of [...outgoing.get(id)!].filter(x=>indegree.get(x)!>0).sort(compareCodeUnits)){if(state.get(next)===1){for(const item of stack.slice(stack.indexOf(next)))cycle.add(item);}else if(!state.has(next))visit(next);}stack.pop();state.set(id,2);};for(const id of residual)if(!state.has(id))visit(id);throw new OperationDomainError('DEPENDENCY_CYCLE','operation graph cycle',{cycleNodeIds:[...cycle].sort(compareCodeUnits)});}
 return result;
}
```

- [ ] **Step 3: Add exhaustive implicit edges and final resolver**

Append to `resolver.ts` and import `stableTopologicalSort` plus `hashCanonicalOperations` only in Task 8. Until Task 8, return operations only:

```ts
import { stableTopologicalSort } from './topo-sort.js';
export interface ResolvedOperationsWithoutHash { readonly operations:readonly import('./canonical.js').CanonicalChangeOperation[] }
export function assertProseAcceptLast(contract:ResolutionContext['contract'],ordered:readonly ResolvedValueNode[]):void{if(contract!=='beat.write'&&contract!=='repair')return;const accepts=ordered.filter(n=>n.operationType==='prose.accept');if(accepts.length!==1)throw new OperationDomainError('PROSE_ACCEPT_REQUIRED','exactly one accept required');if(ordered.at(-1)?.localRef!==accepts[0]!.localRef)throw new OperationDomainError('PROSE_ACCEPT_NOT_LAST','accept must be last');}
export function resolveOperations(drafts:readonly NormalizedOperationDraft[],context:ResolutionContext):ResolvedOperationsWithoutHash{
 const values=resolveOperationValues(drafts,context);const accept=values.nodes.find(n=>n.operationType==='prose.accept');const acceptEdges=accept===undefined?[]:values.nodes.filter(n=>n.localRef!==accept.localRef).map(n=>({before:n.localRef,after:accept.localRef}));const edges=[...values.explicitEdges,...values.nodes.flatMap(n=>n.referenceEdges),...acceptEdges];const ordered=stableTopologicalSort(values.nodes,edges);assertProseAcceptLast(context.contract,ordered);return{operations:ordered.map((node,ordinal)=>brandResolvedNode(node,ordinal))};
}
```

Reference traversal is exhaustive because every `Ref` is resolved only through `refId`, which emits producer-before-consumer edge. Explicit, temporary, outline parent, fact, prose evidence, and accept edges therefore all enter one array.

- [ ] **Step 4: Run permutation/accept/resolver tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/operation-topo-sort.test.ts src/operations/prose-accept-order.test.ts src/operations/tempref-resolve.test.ts
pnpm --filter @narraza/core run test:type:operations
git add packages/core/src/operations
git commit -m "feat(core): order canonical operation DAG"
```

Expected: equivalent permutations yield same order; missing/self/cycle/duplicate edges behave exactly; accept sole and last.

---

### Task 8: Exact canonical operations hash

**Global Constraints:** Use exact existing W1.2 direct import; no nonexistent `sha256Canonical`; do not sort hash input; reject non-contiguous ordinals; exclude only `operationId` and brand.

**Interfaces:** Consumes ordered canonical operations. Produces 64-char lowercase `operationsHash` over exact v1 material.

**Files:**
- Create: `packages/core/src/operations/operations-hash.ts`
- Modify: `packages/core/src/operations/resolver.ts`
- Create: `packages/core/src/operations/operations-hash.test.ts`

- [ ] **Step 1: Write RED exact material tests**

Create `operations-hash.test.ts`:

```ts
import { describe,expect,it } from 'vitest';
import { canonicalJson,sha256Hex } from '../dependency/canonical-json.js';
import { hashCanonicalOperations } from './operations-hash.js';
import { resolveOperations } from './resolver.js';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { context } from './test-fixtures.js';
const drafts=[n({schemaVersion:1,tempRef:'prose',operationType:'prose.version.create',input:{beat:{existingId:'beat-1'},content:'A'}}),n({schemaVersion:1,tempRef:'accept',operationType:'prose.accept',input:{target:{existingId:'beat-1'},proseVersion:{tempRef:'prose'}}})];
it('hashes prefix plus canonical JSON exact fields',()=>{const operations=resolveOperations(drafts,context()).operations;const material=operations.map(({schemaVersion,ordinal,operationType,targetEntityType,targetId,expectedRevision,risk,payload})=>({schemaVersion,ordinal,operationType,targetEntityType,targetId,expectedRevision,risk,payload}));expect(hashCanonicalOperations(operations)).toBe(sha256Hex(`narraza-canonical-operations:v1\n${canonicalJson(material)}`));});
it('excludes operationId and rejects broken ordinal',()=>{const operations=resolveOperations(drafts,context()).operations;expect(hashCanonicalOperations(operations.map((o,i)=>({...o,operationId:`retry-${i}`})))).toBe(hashCanonicalOperations(operations));expect(()=>hashCanonicalOperations(operations.map(o=>({...o,ordinal:o.ordinal+1})))).toThrowError(expect.objectContaining({code:'INVALID_SUGGESTION'}));});
```

Run: `pnpm --filter @narraza/core exec vitest run src/operations/operations-hash.test.ts`

Expected: FAIL because hash module is missing.

- [ ] **Step 2: Implement exact W1.2 hash call**

Create `operations-hash.ts`:

```ts
import { canonicalJson, sha256Hex } from '../dependency/canonical-json.js';
import type { CanonicalChangeOperation } from './canonical.js';
import { OperationDomainError } from './errors.js';
const PREFIX='narraza-canonical-operations:v1\n';
export function hashCanonicalOperations(operations:readonly CanonicalChangeOperation[]):string{
 operations.forEach((operation,index)=>{if(operation.ordinal!==index)throw new OperationDomainError('INVALID_SUGGESTION','operations must have contiguous ordered ordinals',{index,ordinal:operation.ordinal});});
 const material=operations.map(({schemaVersion,ordinal,operationType,targetEntityType,targetId,expectedRevision,risk,payload})=>({schemaVersion,ordinal,operationType,targetEntityType,targetId,expectedRevision,risk,payload}));
 return sha256Hex(PREFIX+canonicalJson(material));
}
```

- [ ] **Step 3: Add hash to final resolver result**

Replace `ResolvedOperationsWithoutHash` and `resolveOperations` return tail:

```ts
import { hashCanonicalOperations } from './operations-hash.js';
export interface ResolvedOperations { readonly operations:readonly import('./canonical.js').CanonicalChangeOperation[]; readonly operationsHash:string }
// after assertProseAcceptLast:
const operations=ordered.map((node,ordinal)=>brandResolvedNode(node,ordinal));
return{operations,operationsHash:hashCanonicalOperations(operations)};
```

- [ ] **Step 4: Run exact hash, mutation, permutation tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/operations-hash.test.ts src/operations/operation-topo-sort.test.ts src/operations/prose-accept-order.test.ts
pnpm --filter @narraza/core run test:type:operations
git add packages/core/src/operations
git commit -m "feat(core): hash canonical operation semantics"
```

Expected: exact prefix fixture passes; operationId changes do not change hash; mutation of every included field changes hash; semantic input permutations produce one order/hash.

---

### Task 9: Repair full re-extraction and writer-safe enforcement

**Global Constraints:** Repair binding required before resolution; repaired differs from source; extraction source equals repaired; sole candidate producer ID and accept ID equal repaired; every `fact.create/update` uses `source.kind:'prose'` with exactly one evidence ID equal repaired prose; missing fact re-extraction fails closed. Generic malformed offsets/hash remain evidence errors.

**Interfaces:** Consumes `RepairExtractionBinding`, resolved operations, evidence provenance. Produces fail-closed repair candidate or `REPAIR_REEXTRACTION_REQUIRED`.

**Files:**
- Modify: `packages/core/src/operations/resolver.ts`
- Create: `packages/core/src/operations/repair-reextract.test.ts`

- [ ] **Step 1: Write RED repair and planner-only tests**

Create `repair-reextract.test.ts`:

```ts
import { describe,expect,it } from 'vitest';
import { parseAndNormalizeSuggestion as n } from './normalized.js';
import { resolveOperations } from './resolver.js';
import { context,HASH_A } from './test-fixtures.js';
const base=[n({schemaVersion:1,tempRef:'prose',operationType:'prose.version.create',input:{beat:{existingId:'beat-1'},content:'A'}}),n({schemaVersion:1,tempRef:'fact',operationType:'fact.create',input:{statement:'X',canonStatus:'draft',visibility:'writer_safe',source:{kind:'prose',evidence:{proseVersionRef:{tempRef:'prose'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}}}}),n({schemaVersion:1,tempRef:'accept',operationType:'prose.accept',input:{target:{existingId:'beat-1'},proseVersion:{tempRef:'prose'}}})];
const binding={sourceProseVersionId:'old',repairedProseVersionId:'prose_version-prose',extractionSourceProseVersionId:'prose_version-prose'} as const;
it('accepts full re-extraction from repaired candidate prose',()=>{const result=resolveOperations(base,context('repair',{repairBinding:binding}));expect(result.operations.at(-1)?.payload).toEqual({kind:'prose.accept',proseVersionId:'prose_version-prose'});expect(result.operations.find(o=>o.operationType==='fact.create')?.payload).toMatchObject({source:{kind:'prose',evidence:{proseVersionId:'prose_version-prose'}}});});
it.each([undefined,{...binding,repairedProseVersionId:'old'},{...binding,extractionSourceProseVersionId:'old'},{...binding,repairedProseVersionId:'wrong'}])('rejects invalid binding %#',(repairBinding)=>expect(()=>resolveOperations(base,context('repair',{repairBinding}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'})));
it('rejects planner_only fact before allocation',()=>{const bad=base.map(d=>d.operationType==='fact.create'&&d.payload.kind==='fact.create'?{...d,payload:{...d.payload,visibility:'planner_only' as const}}:d);expect(()=>resolveOperations(bad,context('repair',{repairBinding:binding,allocateId:()=>{throw new Error('allocator must not run')}}))).toThrowError(expect.objectContaining({code:'OPERATION_NOT_ALLOWED'}));});
it.each(['fact.create','fact.update'] as const)('%s requires prose source with exactly repaired prose evidence',(operationType)=>{
 const target=operationType==='fact.update'?{target:{existingId:'fact-1'}}:{};
 const foundationFact=n({schemaVersion:1,tempRef:'factCheck',operationType,input:{...target,statement:'X',canonStatus:'draft',visibility:'writer_safe',source:{kind:'foundation'}}});
 const mismatchedFact=n({schemaVersion:1,tempRef:'factCheck',operationType,input:{...target,statement:'X',canonStatus:'draft',visibility:'writer_safe',source:{kind:'prose',evidence:{proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}}}});
 expect(()=>resolveOperations([base[0]!,foundationFact,base[2]!],context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED',details:expect.objectContaining({reason:'fact_source_not_repaired_prose'})}));
 expect(()=>resolveOperations([base[0]!,mismatchedFact,base[2]!],context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED',details:expect.objectContaining({reason:'fact_source_not_repaired_prose'})}));
});
it('requires at least one re-extracted fact',()=>expect(()=>resolveOperations([base[0]!,base[2]!],context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED',details:expect.objectContaining({reason:'missing_fact_reextraction'})})));
```

Add this exact table test below existing repair tests:

```ts
const extractionOperationInputs={
 'fact.update':{target:{existingId:'fact-1'},statement:'Y',canonStatus:'established',visibility:'writer_safe',source:{kind:'prose',evidence:{proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}}},
 'state.append':{target:{existingId:'char-1'},stateKey:'place',value:'arsip',evidence:{proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}},
 'belief.append':{target:{existingId:'char-1'},fact:{existingId:'fact-1'},level:'known',evidence:{proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}},
 'disclosure.append':{target:{existingId:'fact-1'},event:{kind:'disclose',result:'known'},evidence:{proseVersionRef:{existingId:'pv-1'},proseContentHash:HASH_A,startUtf16:0,endUtf16:1}},
} as const;
it.each(Object.entries(extractionOperationInputs))('%s rejects source prose evidence during repair',(operationType,input)=>{
 const candidate=[base[0]!,n({schemaVersion:1,tempRef:'extract',operationType:operationType as keyof typeof extractionOperationInputs,input}),base[2]!];
 expect(()=>resolveOperations(candidate,context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'}));
});
it('rejects old run, other candidate, old accept, and unproduced repaired ID',()=>{
 const oldRun=context('repair',{repairBinding:binding,snapshots:context().snapshots.map(s=>s.entityType==='prose_version'?{...s,extractionRunId:'old-run'}:s)});
 expect(()=>resolveOperations(base,oldRun)).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'}));
 const otherCandidate=context('repair',{repairBinding:binding,snapshots:context().snapshots.map(s=>s.entityType==='prose_version'?{...s,candidateId:'other'}:s)});
 expect(()=>resolveOperations(base,otherCandidate)).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'}));
 const oldAccept=[base[0]!,base[1]!,n({schemaVersion:1,tempRef:'accept',operationType:'prose.accept',input:{target:{existingId:'beat-1'},proseVersion:{existingId:'pv-1'}}})];
 expect(()=>resolveOperations(oldAccept,context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'PROSE_ACCEPT_REQUIRED'}));
 expect(()=>resolveOperations(base,context('repair',{repairBinding:{...binding,repairedProseVersionId:'not-produced',extractionSourceProseVersionId:'not-produced'}}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'}));
});
it.each([
 ['candidateId','old-candidate'],
 ['extractionRunId','old-run'],
] as const)('maps consumed existing evidence with old %s to re-extraction required',(field,value)=>{
 const consumed=n({schemaVersion:1,tempRef:'factUpdate',operationType:'fact.update',input:extractionOperationInputs['fact.update']});
 const candidate=[base[0]!,consumed,base[2]!];
 const snapshots=context().snapshots.map(s=>s.entityType==='prose_version'&&s.entityId==='pv-1'?{...s,[field]:value}:s);
 expect(()=>resolveOperations(candidate,context('repair',{repairBinding:binding,snapshots}))).toThrowError(expect.objectContaining({code:'REPAIR_REEXTRACTION_REQUIRED'}));
});
it.each([
 {proseContentHash:'b'.repeat(64),startUtf16:0,endUtf16:1},
 {proseContentHash:HASH_A,startUtf16:0,endUtf16:2},
] as const)('keeps consumed evidence hash/range failures typed INVALID_PROSE_EVIDENCE_BINDING',evidence=>{
 const input={...extractionOperationInputs['fact.update'],source:{kind:'prose' as const,evidence:{...extractionOperationInputs['fact.update'].source.evidence,...evidence}}};
 const candidate=[base[0]!,n({schemaVersion:1,tempRef:'factUpdate',operationType:'fact.update',input}),base[2]!];
 expect(()=>resolveOperations(candidate,context('repair',{repairBinding:binding}))).toThrowError(expect.objectContaining({code:'INVALID_PROSE_EVIDENCE_BINDING'}));
});
```

Run focused repair tests. Expected: FAIL until repair checks exist.

- [ ] **Step 2: Implement pre-allocation binding validation**

Add at start of `resolveOperationValues`, immediately after contract validation and before snapshot/index/allocation:

```ts
if(context.contract==='repair'){
 const b=context.repairBinding;
 if(b===undefined||Object.keys(b).sort().join(',')!=='extractionSourceProseVersionId,repairedProseVersionId,sourceProseVersionId'||[b.sourceProseVersionId,b.repairedProseVersionId,b.extractionSourceProseVersionId].some(x=>typeof x!=='string'||x.trim()==='')||b.sourceProseVersionId===b.repairedProseVersionId||b.extractionSourceProseVersionId!==b.repairedProseVersionId) throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','invalid repair extraction binding');
}
```

- [ ] **Step 3: Implement post-resolution repair assertions**

Before `return {nodes,...}` in `resolveOperationValues`:

```ts
if(context.contract==='repair'){
 const b=context.repairBinding!;const producer=nodes.find(n=>n.operationType==='prose.version.create');const accept=nodes.find(n=>n.operationType==='prose.accept');
 if(producer?.targetId!==b.repairedProseVersionId||accept?.payload.kind!=='prose.accept'||accept.payload.proseVersionId!==b.repairedProseVersionId) throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','repair producer/accept mismatch');
 const factNodes=nodes.filter(node=>node.operationType==='fact.create'||node.operationType==='fact.update');
 if(factNodes.length===0)throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','repair must re-extract at least one fact',{reason:'missing_fact_reextraction'});
 for(const node of factNodes){
  const source=node.payload.kind==='fact.create'||node.payload.kind==='fact.update'?node.payload.source:undefined;
  if(source?.kind!=='prose'||node.evidenceProseVersionIds.length!==1||node.evidenceProseVersionIds[0]!==b.repairedProseVersionId)throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','repair fact source must be exactly repaired prose evidence',{localRef:node.localRef,reason:'fact_source_not_repaired_prose',evidenceProseVersionIds:node.evidenceProseVersionIds});
 }
 const extractionKinds=new Set(['state.append','belief.append','disclosure.append']);
 for(const node of nodes)if(extractionKinds.has(node.operationType)&&node.evidenceProseVersionIds.some(id=>id!==b.repairedProseVersionId))throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','repair evidence uses source prose',{localRef:node.localRef});
}
```

Wrap only resolver-local evidence call with exact provenance remap; `resolveProseEvidence` remains generic and hash/range failures retain `INVALID_PROSE_EVIDENCE_BINDING`:

```ts
const evidence=(value:Parameters<typeof resolveProseEvidence>[0])=>{
 let e:CanonicalProseEvidenceBinding;
 try{e=resolveProseEvidence(value,index,temporaryProse,context);}
 catch(error){
  if(context.contract==='repair'&&error instanceof OperationDomainError&&error.code==='INVALID_PROSE_EVIDENCE_BINDING'&&error.details.reason==='provenance')throw new OperationDomainError('REPAIR_REEXTRACTION_REQUIRED','repair consumed evidence from old extraction provenance',{localRef:d.localRef,proseVersionId:error.details.proseVersionId,actualCandidateId:error.details.actualCandidateId,actualExtractionRunId:error.details.actualExtractionRunId});
  throw error;
 }
 evidenceIds.push(e.proseVersionId);if(value.proseVersionRef.kind==='temporary')edges.push({before:value.proseVersionRef.tempRef,after:d.localRef});return e;
};
```

No message matching. Only structured `details.reason === 'provenance'` remaps.

- [ ] **Step 4: Run repair/writer-safe/evidence/accept tests and commit green**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/repair-reextract.test.ts src/operations/op-allowlist.test.ts src/operations/evidence-binding.test.ts src/operations/prose-accept-order.test.ts
pnpm --filter @narraza/core run test:type:operations
git add packages/core/src/operations
git commit -m "feat(core): require writer-safe repair re-extraction"
```

Expected: all five extraction operation kinds reject old evidence; fact.create/update foundation source, missing fact re-extraction, and repaired prose mismatch return `REPAIR_REEXTRACTION_REQUIRED`; repaired producer/evidence/accept IDs match; planner-only fails before allocator.

---

### Task 10: Public API barrels

**Global Constraints:** Export public contracts explicitly; do not export brand symbol, constructor, guards, graph internals, test fixtures, temporary prose metadata, or unbranded canonical type.

**Interfaces:** Consumes all green operation modules. Produces `operations` namespace at core package root.

**Files:**
- Create: `packages/core/src/operations/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/operations/op-type-boundary.test.ts`

- [ ] **Step 1: Add RED public-surface test using final barrel**

Append to `op-type-boundary.test.ts`:

```ts
import * as operations from './index.js';
it('exports public API without canonical internals',()=>{expect(operations).toHaveProperty('parseModelSuggestion');expect(operations).toHaveProperty('normalizeSuggestion');expect(operations).toHaveProperty('resolveOperations');expect(operations).toHaveProperty('hashCanonicalOperations');expect(operations).not.toHaveProperty('CANONICAL_OPERATION');expect(operations).not.toHaveProperty('brandCanonicalOperation');});
```

Run focused test. Expected: FAIL because final barrel is absent.

- [ ] **Step 2: Create explicit operation barrel**

Create `operations/index.ts`:

```ts
export { OperationDomainError, type OperationErrorCode } from './errors.js';
export type { CanonicalOperationType, CanonicalEntitySnapshot, EntityType, IdAllocator, OperationContract, OperationRisk, Ref, RepairExtractionBinding, ResolutionContext, SuggestionOperationType } from './entities.js';
export type { BeliefDowngradeReason, BeliefLevel, CanonicalOperationPayload, CanonicalProseEvidenceBinding, CharacterFields, CharacterRole, FactCanonStatus, FactVisibility, FoundationChanges, NormalizedOperationPayload, ProseEvidenceBinding } from './payloads.js';
export { parseModelSuggestion, type ModelSuggestionDraft } from './suggestion.js';
export { normalizeSuggestion, parseAndNormalizeSuggestion, type NormalizedOperationDraft } from './normalized.js';
export type { CanonicalChangeOperation } from './canonical.js';
export { OPERATION_CATALOG, CONTRACT_LIMITS, GLOBAL_OPERATION_LIMIT, CREATION_LIMIT, DEPENDENCY_LIMIT } from './catalog.js';
export { resolveOperations, type ResolvedOperations } from './resolver.js';
export { hashCanonicalOperations } from './operations-hash.js';
```

Append to existing `packages/core/src/index.ts` without replacing predecessor exports:

```ts
export * as operations from './operations/index.js';
```

- [ ] **Step 3: Run runtime surface, type fixture, build, declaration audit, commit**

```bash
pnpm --filter @narraza/core exec vitest run src/operations/op-type-boundary.test.ts
pnpm --filter @narraza/core run test:type:operations
pnpm --filter @narraza/core build
if grep -R -nE 'CANONICAL_OPERATION|brandCanonicalOperation|UnbrandedCanonicalOperation|TemporaryProse' packages/core/dist/operations/index.d.ts packages/core/dist/index.d.ts; then exit 1; fi
git add packages/core/src/operations/index.ts packages/core/src/index.ts packages/core/src/operations/op-type-boundary.test.ts
git commit -m "feat(core): export operation layer API"
```

Expected: tests/typecheck/build pass; declaration grep has no matches; commit green.

---

### Task 11: Full verification and scope audit

**Global Constraints:** Fix only files listed in W1.5 file map; no progress checklist update before merge; no skipped tests or placeholder text.

**Interfaces:** Consumes complete W1.5 package. Produces verified branch ready for review.

**Files:** No new files. Modify only W1.5 file-map paths if verification exposes defect; `docs/verification-matrix.md` remains in scope from Task 1.

- [ ] **Step 1: Run complete focused W1.5 tests**

```bash
pnpm --filter @narraza/core exec vitest run \
  src/operations/op-type-boundary.test.ts \
  src/operations/payload-catalog.test.ts \
  src/operations/op-allowlist.test.ts \
  src/operations/snapshot.test.ts \
  src/operations/evidence-binding.test.ts \
  src/operations/tempref-resolve.test.ts \
  src/operations/operation-topo-sort.test.ts \
  src/operations/prose-accept-order.test.ts \
  src/operations/operations-hash.test.ts \
  src/operations/repair-reextract.test.ts
pnpm --filter @narraza/core run test:type:operations
```

Expected: 10 runtime files PASS; dedicated `tsc` exits 0; no skipped/todo tests.

- [ ] **Step 2: Run repo gates**

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm format:check
pnpm arch
pnpm build:packages
```

Expected: every command exits 0; architecture reports no forbidden core dependency.

- [ ] **Step 3: Mechanically audit catalog, writer-safe rule, hash import, and placeholders**

```bash
for op in foundation.update character.create character.update fact.create fact.update state.append belief.append disclosure.append reveal.create reveal.update breadcrumb.create outline.create outline.update prose.version.create prose.accept; do rg -q "'$op'" packages/core/src/operations/catalog.ts || exit 1; done
rg -n "planner_only|writer_safe_required" packages/core/src/operations/catalog.ts packages/core/src/operations/op-allowlist.test.ts
rg -n "sha256Hex\(PREFIX\+canonicalJson\(material\)\)" packages/core/src/operations/operations-hash.ts
if rg -n 'sha256Canonical|TO''DO|FIX''ME|place''holder|implement later' packages/core/src/operations packages/core/type-tests packages/core/tsconfig.operations-type-tests.json; then exit 1; fi
printf 'PASS operation catalog, writer safety, hash, and placeholder audit\n'
```

Expected: writer-safe lines shown; exact hash line shown; prohibited scan empty; PASS printed.

- [ ] **Step 4: Audit pure dependencies, formatting, and changed scope**

```bash
if rg -n "from ['\"](@prisma|prisma|next|react|@narraza/(ai|db|application))" packages/core/src/operations; then exit 1; fi
if rg -n 'Math\.random|randomUUID|crypto\.random' packages/core/src/operations; then exit 1; fi
pnpm exec prettier --write packages/core/src/operations packages/core/type-tests packages/core/tsconfig.operations-type-tests.json packages/core/package.json packages/core/src/index.ts
git diff --check
git status --short
git diff --name-only master...HEAD
rg -n "operation-topo-sort|operations-hash" docs/verification-matrix.md
```

Expected: forbidden scans empty; Prettier succeeds; `git diff --check` empty; branch diff contains only W1.5 file map paths; matrix grep shows both Task 1 rows. No edits under `apps/`, `packages/db`, `packages/ai`, `packages/application`, `prisma/`, `.github/`, or docs except `docs/verification-matrix.md`.

- [ ] **Step 5: Commit verification fixes only if files changed**

```bash
git add docs/verification-matrix.md packages/core/package.json packages/core/tsconfig.operations-type-tests.json packages/core/type-tests packages/core/src/operations packages/core/src/index.ts
git diff --cached --quiet || git commit -m "test(core): complete W1.5 operation verification"
git status --short
```

Expected: clean status; no empty commit.

## Acceptance checklist

- [ ] Verification matrix maps stable DAG/cycle and canonical operations hash/permutation targets before implementation tests.
- [ ] Exact model target and payload input shape exists for all 15 operations; create target derives only from top-level `tempRef`; existing/update/append target comes from `input.target`.
- [ ] Runtime table tests cover exact keys, nested keys, aliases, collisions, reference identity, and wrong types for all 15 operations.
- [ ] Dedicated `tsconfig.operations-type-tests.json` and `test:type:operations` prove three compile-time boundaries.
- [ ] Every task imports direct modules until final barrel, so each green commit builds independently.
- [ ] `beat.write` and `repair` reject `planner_only` facts before allocator execution.
- [ ] Snapshot has `parentId`, `exists`, `deleted`, and existing outline `ordinal`; validation rejects null/primitive/unknown entity types, missing entity counters/fields, and duplicate `(entityType, entityId)` before resolver use.
- [ ] Temporary outline roadmap→arc→chapter→beat chains resolve; metadata exposes resolved type/ID/ordinal/narrative sequence by localRef and resolved identity; reveal/breadcrumb positions use temporary metadata but snapshot only for existing refs; existing/temporary parent sibling counters and position results stay stable across input permutations; updates preserve target ordinal.
- [ ] Allocated create identities are seeded from every snapshot identity including deleted/tombstone, collide by `(entityType, entityId)`, and permit same raw ID for different entity types.
- [ ] Temporary fact keys allocate exactly once per create localRef in stable precompute order, validate uniqueness, and are reused by fact/belief/disclosure branches.
- [ ] Hash uses exact direct imports `canonicalJson` and `sha256Hex`, with `sha256Hex(PREFIX + canonicalJson(material))`; no `sha256Canonical`.
- [ ] All 15 canonical payload branches derive IDs, revisions, risk, fact keys, ordinals, sequences, and content hash from trusted context.
- [ ] Evidence validates same candidate/run, lowercase content hash, and UTF-16 range; temporary producer edges are explicit.
- [ ] DAG covers explicit refs, temporary producers, outline parents, facts, prose evidence, and all-non-accept-before-accept; sort and cycle reporting stable.
- [ ] `prose.accept` exactly one and last for `beat.write`/`repair`, points to candidate-produced prose on target beat.
- [ ] Repair forces at least one new writer-safe fact extraction; each `fact.create/update` source is prose with exactly repaired prose evidence; foundation source, missing fact extraction, repaired-ID mismatch, and consumed old candidate/run provenance map to `REPAIR_REEXTRACTION_REQUIRED`, while consumed hash/range failures remain `INVALID_PROSE_EVIDENCE_BINDING`.
- [ ] Operations hash excludes operationId, includes every semantic field, validates contiguous ordinals, and is permutation-stable.
- [ ] Focused runtime tests, dedicated type test, unit/typecheck/lint/format/arch/build gates all pass.
