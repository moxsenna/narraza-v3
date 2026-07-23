# W1.2 Core Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build W1.2 pure policies with fail-closed runtime boundaries for narrative chronology, reveal/expression safety, knowledge/disclosure, foundation readiness, dependency hashing/staleness, prose, and repair stopping.

**Architecture:** Every public runtime function accepts `unknown`, validates complete exact shape before any decision read, then calls a typed internal pure function. Shared reflection helpers inspect `Reflect.ownKeys` and property descriptors without invoking accessors; task parsers add nested scalar/domain rules and translate every failure into task-owned typed errors.

**Tech Stack:** TypeScript 5.9 strict/NodeNext, Node.js 22 `node:crypto`, Vitest 4, pnpm 11, ESLint, Prettier, dependency-cruiser.

---

## Locked runtime invariant

- Public W1.2 runtime boundaries accept `unknown`; multi-argument boundaries accept `unknown` for every external argument.
- Validation finishes before filtering, sorting, folding, scoring, hashing, comparison, equality, or branch-dependent reads.
- Plain records require `Object.prototype`, exact `Reflect.ownKeys`, enumerable data descriptors, no symbols, accessors, non-enumerable fields, or extras.
- Arrays require `Array.prototype`, built-in `length`, dense enumerable data indices, and no named/symbol/accessor/non-enumerable extras.
- Nested records and arrays receive identical checks. Scalars use exact domain rules; no coercion, repair, dropping, or deduplication.
- Reflection and parser failures, including proxy traps, are translated to boundary-owned domain errors. No malformed public call may leak `TypeError`, `RangeError`, `CanonicalJsonError`, or another policy's error.
- Typed decision helpers remain module-private. Only public parsers/decisions listed in Task 11 enter package barrels.
- `expression-policy.ts` and `canonical-json.ts` retain their already-hardened external validation. They use shared helpers where doing so preserves their locked accepted grammar and typed errors.
- Core stays pure, synchronous, deterministic, immutable, framework-free, and locale-independent.

## Branch prerequisite

- [ ] Run `git status --short`, switch to updated `master`, verify approved spec exists, then create `feat/m1-core-policies`.
- [ ] Expected: clean worktree; branch name exactly `feat/m1-core-policies`.

## File map

Create runtime files under `packages/core/src/{validation,narrative,foundation,dependency,prose}` and matching tests named below. Modify only `docs/verification-matrix.md` and `packages/core/src/index.ts` outside those folders. Do not modify `docs/PROGRESS-CHECKLIST.md`, package manifests, tsconfig, or architecture configuration.

---

### Task 1: Shared exact validation and narrative position

**Files:**
- Create: `packages/core/src/validation/exact.ts`
- Create: `packages/core/src/validation/hostile-fixtures.ts`
- Create: `packages/core/src/narrative/position.ts`
- Create: `packages/core/src/narrative/narrative-position.test.ts`
- Modify: `docs/verification-matrix.md`

- [ ] **Step 1: Add verification rows**

Add missing `narrative-position`, `reveal-policy`, `canonical-json`, `stale-policy`, and `prose-policy` rows before `When adding invariants:`. Preserve all existing rows.

- [ ] **Step 2: Write shared helpers**

Create `packages/core/src/validation/exact.ts` exactly:

```ts
export type Fail = (message: string) => never;
export type ExactRecord = Readonly<Record<string, unknown>>;

function guarded<T>(operation: () => T, fail: Fail, message: string): T {
  try {
    return operation();
  } catch {
    return fail(message);
  }
}

export function exactObject(
  input: unknown,
  expectedKeys: readonly string[],
  fail: Fail,
  label: string,
): ExactRecord {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return fail(`${label} must be an exact plain object`);
  }
  if (guarded(() => Object.getPrototypeOf(input), fail, `${label} reflection failed`) !== Object.prototype) {
    return fail(`${label} must have Object.prototype`);
  }
  const keys = guarded(() => Reflect.ownKeys(input), fail, `${label} reflection failed`);
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        !expectedKeys.includes(key) ||
        expectedKeys.filter((candidate) => candidate === key).length !== 1,
    )
  ) {
    return fail(`${label} must contain exactly ${expectedKeys.join(', ')}`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = guarded(
      () => Object.getOwnPropertyDescriptor(input, key),
      fail,
      `${label}.${key} reflection failed`,
    );
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}.${key} must be an enumerable data property`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

export function denseArray(input: unknown, fail: Fail, label: string): readonly unknown[] {
  if (!Array.isArray(input)) return fail(`${label} must be a dense array`);
  if (guarded(() => Object.getPrototypeOf(input), fail, `${label} reflection failed`) !== Array.prototype) {
    return fail(`${label} must have Array.prototype`);
  }
  const keys = guarded(() => Reflect.ownKeys(input), fail, `${label} reflection failed`);
  const lengthDescriptor = guarded(
    () => Object.getOwnPropertyDescriptor(input, 'length'),
    fail,
    `${label}.length reflection failed`,
  );
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.enumerable ||
    !('value' in lengthDescriptor) ||
    lengthDescriptor.value !== input.length ||
    keys.length !== input.length + 1
  ) {
    return fail(`${label} must have only dense indices and built-in length`);
  }
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const key = String(index);
    if (!keys.includes(key)) return fail(`${label} must not be sparse`);
    const descriptor = guarded(
      () => Object.getOwnPropertyDescriptor(input, key),
      fail,
      `${label}[${index}] reflection failed`,
    );
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(`${label}[${index}] must be an enumerable data property`);
    }
    values.push(descriptor.value);
  }
  if (keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length))) {
    return fail(`${label} contains an extra property`);
  }
  return values;
}

export const nonEmptyString = (value: unknown, fail: Fail, label: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fail(`${label} must be a non-empty string`);

export const nullableString = (value: unknown, fail: Fail, label: string): string | null =>
  value === null || typeof value === 'string' ? value : fail(`${label} must be string or null`);

export const booleanValue = (value: unknown, fail: Fail, label: string): boolean =>
  typeof value === 'boolean' ? value : fail(`${label} must be boolean`);

export const nonNegativeSafeInteger = (value: unknown, fail: Fail, label: string): number =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : fail(`${label} must be a non-negative safe integer`);

export function optionalDataValue(record: ExactRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
```

Create `packages/core/src/validation/hostile-fixtures.ts` as test-only reusable constructors:

```ts
export function hostileObjects(valid: Record<string, unknown>): readonly unknown[] {
  const symbol = { ...valid } as Record<PropertyKey, unknown>;
  symbol[Symbol('extra')] = true;
  const nonEnumerable = Object.defineProperty({ ...valid }, 'hidden', { value: true });
  let reads = 0;
  const accessor = Object.defineProperty({ ...valid }, Object.keys(valid)[0]!, {
    get: () => { reads += 1; return null; },
    enumerable: true,
  });
  return [null, 7, 'x', true, { ...valid, extra: true }, symbol, nonEnumerable, accessor, { accessorReads: () => reads }];
}

export function hostileArrays(valid: readonly unknown[]): readonly unknown[] {
  const extra = [...valid] as unknown[] & { extra?: true }; extra.extra = true;
  const symbol = [...valid] as unknown[] & Record<PropertyKey, unknown>; symbol[Symbol('x')] = true;
  const nonEnumerable = Object.defineProperty([...valid], '0', { value: valid[0], enumerable: false });
  const accessor = Object.defineProperty([...valid], '0', { get: () => valid[0], enumerable: true });
  return [null, 'array', Array(1), extra, symbol, nonEnumerable, accessor];
}
```

- [ ] **Step 3: Implement narrative position parser and public decisions**

```ts
import { exactObject, nonEmptyString, nonNegativeSafeInteger, type Fail } from '../validation/exact.js';

export interface NarrativePosition { readonly chapterId: string; readonly beatId?: string; readonly sequence: number }
export class NarrativePositionError extends Error {
  readonly code = 'INVALID_NARRATIVE_POSITION' as const;
  constructor(message: string) { super(message); this.name = 'NarrativePositionError'; }
}
const fail: Fail = (message) => { throw new NarrativePositionError(message); };
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function parsePosition(input: unknown): NarrativePosition {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail('position must be object');
    const keys = Reflect.ownKeys(input);
    const expected = keys.includes('beatId') ? ['chapterId', 'beatId', 'sequence'] : ['chapterId', 'sequence'];
    const value = exactObject(input, expected, fail, 'position');
    const chapterId = nonEmptyString(value.chapterId, fail, 'chapterId');
    const sequence = nonNegativeSafeInteger(value.sequence, fail, 'sequence');
    if (!expected.includes('beatId')) return { chapterId, sequence };
    return { chapterId, beatId: nonEmptyString(value.beatId, fail, 'beatId'), sequence };
  } catch (error) {
    if (error instanceof NarrativePositionError) throw error;
    return fail('position reflection failed');
  }
}
function compareTyped(left: NarrativePosition, right: NarrativePosition): number {
  return left.sequence - right.sequence || compareText(left.chapterId, right.chapterId) || compareText(left.beatId ?? '', right.beatId ?? '');
}
export const createNarrativePosition = (input: unknown): NarrativePosition => parsePosition(input);
export function compareNarrativePositions(left: unknown, right: unknown): number {
  const parsedLeft = parsePosition(left); const parsedRight = parsePosition(right);
  return compareTyped(parsedLeft, parsedRight);
}
export function narrativePositionsEqual(left: unknown, right: unknown): boolean {
  const parsedLeft = parsePosition(left); const parsedRight = parsePosition(right);
  return compareTyped(parsedLeft, parsedRight) === 0;
}
```

- [ ] **Step 4: Add hostile position matrix**

```ts
it.each([
  ...hostileObjects({ chapterId: 'c1', sequence: 0 }).slice(0, -1),
  { chapterId: 'c1', sequence: -1 }, { chapterId: 3, sequence: 0 },
  { chapterId: 'c1', beatId: '', sequence: 0 },
])('rejects hostile position %# with owned error', (input) => {
  expect(() => createNarrativePosition(input)).toThrow(NarrativePositionError);
  expect(() => createNarrativePosition(input)).not.toThrow(TypeError);
  expect(() => compareNarrativePositions(input, valid)).toThrow(NarrativePositionError);
  expect(() => narrativePositionsEqual(valid, input)).toThrow(NarrativePositionError);
});
```

Retain chronology/equality success assertions from original plan. Run focused tests, Prettier, then commit Task 1 files.

---

### Task 2: Reveal and expression safety

**Files:** `reveal-policy.ts`, `reveal-policy.test.ts`, `expression-policy.ts`, `expression-policy.test.ts`.

- [ ] **Step 1: Implement reveal boundary before existing typed decision**

Use private `comparePosition` on already parsed values; never call public comparator from internal sort.

```ts
import { denseArray, exactObject, nonEmptyString, type Fail } from '../validation/exact.js';
import { createNarrativePosition, type NarrativePosition } from './position.js';

export interface RevealBreadcrumb { readonly id: string; readonly position: NarrativePosition; readonly safeDirective: string }
export interface RevealPolicyInput { readonly targetPosition: NarrativePosition; readonly currentPosition: NarrativePosition; readonly breadcrumbs: readonly RevealBreadcrumb[]; readonly safeDirectives: readonly string[]; readonly restrictedGuardSet: { readonly prohibitedExact: readonly string[]; readonly prohibitedAliases: readonly string[]; readonly sensitiveTerms: readonly string[] } }
export interface WriterRevealGuidance { readonly status: 'before_breadcrumb'|'breadcrumb_due'|'hold'|'reveal_due'|'revealed'; readonly safeDirectives: readonly string[] }
export interface RestrictedRevealGuardSet { readonly prohibitedExact: readonly string[]; readonly prohibitedAliases: readonly string[]; readonly sensitiveTerms: readonly string[]; readonly targetPosition: NarrativePosition }
export interface RevealViews { readonly guidance: WriterRevealGuidance; readonly restrictedGuardSet: RestrictedRevealGuardSet }
export class RevealPolicyError extends Error { readonly code = 'INVALID_REVEAL_POLICY_INPUT' as const; constructor(message: string) { super(message); this.name = 'RevealPolicyError'; } }
const fail: Fail = (message) => { throw new RevealPolicyError(message); };
const stringArray = (value: unknown, label: string): readonly string[] => denseArray(value, fail, label).map((item, index) => nonEmptyString(item, fail, `${label}[${index}]`));
const position = (value: unknown, label: string): NarrativePosition => { try { return createNarrativePosition(value); } catch { return fail(`${label} is invalid`); } };
const order = (a: NarrativePosition, b: NarrativePosition): number => a.sequence - b.sequence || (a.chapterId < b.chapterId ? -1 : a.chapterId > b.chapterId ? 1 : 0) || ((a.beatId ?? '') < (b.beatId ?? '') ? -1 : (a.beatId ?? '') > (b.beatId ?? '') ? 1 : 0);

function parseReveal(input: unknown): RevealPolicyInput {
  try {
    const root = exactObject(input, ['targetPosition','currentPosition','breadcrumbs','safeDirectives','restrictedGuardSet'], fail, 'reveal input');
    const targetPosition = position(root.targetPosition, 'targetPosition');
    const currentPosition = position(root.currentPosition, 'currentPosition');
    const ids = new Set<string>(); const positions = new Set<string>();
    const breadcrumbs = denseArray(root.breadcrumbs, fail, 'breadcrumbs').map((raw, index) => {
      const item = exactObject(raw, ['id','position','safeDirective'], fail, `breadcrumbs[${index}]`);
      const id = nonEmptyString(item.id, fail, `breadcrumbs[${index}].id`);
      const parsedPosition = position(item.position, `breadcrumbs[${index}].position`);
      const key = `${parsedPosition.sequence}\0${parsedPosition.chapterId}\0${parsedPosition.beatId ?? ''}`;
      if (ids.has(id) || positions.has(key) || order(parsedPosition, targetPosition) >= 0) return fail('breadcrumbs must have unique IDs/positions before target');
      ids.add(id); positions.add(key);
      return { id, position: parsedPosition, safeDirective: nonEmptyString(item.safeDirective, fail, `breadcrumbs[${index}].safeDirective`) };
    });
    const guard = exactObject(root.restrictedGuardSet, ['prohibitedExact','prohibitedAliases','sensitiveTerms'], fail, 'restrictedGuardSet');
    return { targetPosition, currentPosition, breadcrumbs, safeDirectives: stringArray(root.safeDirectives, 'safeDirectives'), restrictedGuardSet: { prohibitedExact: stringArray(guard.prohibitedExact, 'prohibitedExact'), prohibitedAliases: stringArray(guard.prohibitedAliases, 'prohibitedAliases'), sensitiveTerms: stringArray(guard.sensitiveTerms, 'sensitiveTerms') } };
  } catch (error) { if (error instanceof RevealPolicyError) throw error; return fail('reveal input reflection failed'); }
}
function decideReveal(input: RevealPolicyInput): RevealViews {
  const breadcrumbs = [...input.breadcrumbs].sort((a,b) => order(a.position,b.position) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const due = breadcrumbs.find((item) => order(item.position,input.currentPosition) === 0);
  const targetOrder = order(input.currentPosition,input.targetPosition);
  const status: WriterRevealGuidance['status'] = targetOrder === 0 ? 'reveal_due' : targetOrder > 0 ? 'revealed' : due ? 'breadcrumb_due' : breadcrumbs[0] && order(input.currentPosition,breadcrumbs[0].position) < 0 ? 'before_breadcrumb' : 'hold';
  return { guidance: { status, safeDirectives: due ? [...input.safeDirectives,due.safeDirective] : [...input.safeDirectives] }, restrictedGuardSet: { ...input.restrictedGuardSet, prohibitedExact: [...input.restrictedGuardSet.prohibitedExact], prohibitedAliases: [...input.restrictedGuardSet.prohibitedAliases], sensitiveTerms: [...input.restrictedGuardSet.sensitiveTerms], targetPosition: input.targetPosition } };
}
export const buildRevealViews = (input: unknown): RevealViews => decideReveal(parseReveal(input));
```

- [ ] **Step 2: Implement expression boundary and private decision**

```ts
export type ExpressionPermission = 'may_state' | 'behavior_only' | 'must_conceal' | 'unknown';
export interface ExpressionPolicyInput { readonly knowsFact:boolean; readonly revealAllows:boolean; readonly disclosureAllows:boolean; readonly isPov:boolean; readonly behavioralDirectives:readonly string[] }
export interface ExpressionDecision { readonly permission:ExpressionPermission; readonly safeDirectives:readonly string[] }
export type ExpressionPolicyErrorCode = 'INVALID_EXPRESSION_POLICY_INPUT';
export class ExpressionPolicyError extends Error { constructor(readonly code:ExpressionPolicyErrorCode,message:string){super(message);this.name='ExpressionPolicyError';} }
const expressionFail:Fail=(message)=>{throw new ExpressionPolicyError('INVALID_EXPRESSION_POLICY_INPUT',message);};
function parseExpression(input:unknown):ExpressionPolicyInput {
  try {
    const x=exactObject(input,['knowsFact','revealAllows','disclosureAllows','isPov','behavioralDirectives'],expressionFail,'expression input');
    const behavioralDirectives=denseArray(x.behavioralDirectives,expressionFail,'behavioralDirectives').map((value,index)=>nonEmptyString(value,expressionFail,`behavioralDirectives[${index}]`));
    return {knowsFact:booleanValue(x.knowsFact,expressionFail,'knowsFact'),revealAllows:booleanValue(x.revealAllows,expressionFail,'revealAllows'),disclosureAllows:booleanValue(x.disclosureAllows,expressionFail,'disclosureAllows'),isPov:booleanValue(x.isPov,expressionFail,'isPov'),behavioralDirectives};
  } catch(error) { if(error instanceof ExpressionPolicyError) throw error; return expressionFail('expression reflection failed'); }
}
function decideExpressionTyped(input:ExpressionPolicyInput):ExpressionDecision {
  if(!input.knowsFact)return {permission:'unknown',safeDirectives:[]};
  if(!input.revealAllows||!input.disclosureAllows)return {permission:'must_conceal',safeDirectives:[]};
  if(!input.isPov)return {permission:'behavior_only',safeDirectives:[...input.behavioralDirectives]};
  return {permission:'may_state',safeDirectives:[]};
}
export const decideExpression=(input:unknown):ExpressionDecision=>decideExpressionTyped(parseExpression(input));
```

- [ ] **Step 3: Add boundary matrices**

```ts
it.each([
  ...hostileObjects(validReveal).slice(0,-1),
  { ...validReveal, breadcrumbs: Array(1) },
  { ...validReveal, safeDirectives: ['ok', 1] },
  { ...validReveal, restrictedGuardSet: { ...validReveal.restrictedGuardSet, extra: true } },
  { ...validReveal, breadcrumbs: [{ id:'x', position:{ chapterId:'c', sequence:'future' }, safeDirective:'x' }] },
])('reveal rejects hostile boundary %#', (input) => {
  expect(() => buildRevealViews(input)).toThrow(RevealPolicyError);
  expect(() => buildRevealViews(input)).not.toThrow(TypeError);
});

it.each([
  ...hostileObjects(validExpression).slice(0,-1),
  { ...validExpression, behavioralDirectives: Array(1) },
  { ...validExpression, behavioralDirectives: ['ok', 1] },
  { ...validExpression, knowsFact: false, behavioralDirectives: [3] },
])('expression rejects hostile/decision-irrelevant input %#', (input) => {
  expect(() => decideExpression(input)).toThrow(ExpressionPolicyError);
  expect(() => decideExpression(input)).not.toThrow(TypeError);
});
```

Retain chronology, safe projection, precedence, and leak assertions. Run both tests and commit.

---

### Task 3: Canonical timestamp and knowledge/belief fold

**Files:** `canonical-timestamp.ts`, `knowledge-policy.ts`, `belief-transition.test.ts`.

- [ ] **Step 1: Implement exact parser and boundary**

```ts
import { booleanValue, denseArray, exactObject, nonEmptyString, nonNegativeSafeInteger, type Fail } from '../validation/exact.js';
import { parseCanonicalTimestamp } from './canonical-timestamp.js';
export type BeliefLevel = 'unknown'|'suspected'|'believed'|'known'|'disproven';
export type BeliefDowngradeReason = 'new_evidence'|'source_discredited'|'memory_loss'|'deliberate_deception'|'canon_correction';
export interface BeliefEvent { readonly id:string; readonly effectiveSequence:number; readonly createdAt:string; readonly level:BeliefLevel; readonly downgradeReason?:BeliefDowngradeReason }
export interface BeliefFoldResult { readonly level:BeliefLevel; readonly sourceEventId:string|null; readonly appliedEventIds:readonly string[] }
export type BeliefPolicyErrorCode = 'INVALID_BELIEF_EVENT'|'INVALID_BELIEF_TRANSITION';
export class BeliefPolicyError extends Error { constructor(readonly code:BeliefPolicyErrorCode,message:string){super(message);this.name='BeliefPolicyError';} }
const levels = new Set<BeliefLevel>(['unknown','suspected','believed','known','disproven']);
const reasons = new Set<BeliefDowngradeReason>(['new_evidence','source_discredited','memory_loss','deliberate_deception','canon_correction']);
const fail:Fail=(message)=>{throw new BeliefPolicyError('INVALID_BELIEF_EVENT',message);};
function parseEvent(raw:unknown,index:number):BeliefEvent {
  if (raw===null || typeof raw!=='object' || Array.isArray(raw)) return fail(`events[${index}] invalid`);
  let keys:readonly PropertyKey[]; try { keys=Reflect.ownKeys(raw); } catch { return fail(`events[${index}] reflection failed`); }
  const expected=keys.includes('downgradeReason')?['id','effectiveSequence','createdAt','level','downgradeReason']:['id','effectiveSequence','createdAt','level'];
  const item=exactObject(raw,expected,fail,`events[${index}]`);
  const createdAt=nonEmptyString(item.createdAt,fail,'createdAt'); if(parseCanonicalTimestamp(createdAt)===null)return fail('createdAt must be canonical UTC milliseconds');
  if(!levels.has(item.level as BeliefLevel))return fail('invalid belief level');
  if(expected.includes('downgradeReason')&&!reasons.has(item.downgradeReason as BeliefDowngradeReason))return fail('invalid downgrade reason');
  return {id:nonEmptyString(item.id,fail,'id'),effectiveSequence:nonNegativeSafeInteger(item.effectiveSequence,fail,'effectiveSequence'),createdAt,level:item.level as BeliefLevel,...(expected.includes('downgradeReason')?{downgradeReason:item.downgradeReason as BeliefDowngradeReason}:{})};
}
function foldTyped(events:readonly BeliefEvent[],targetSequence:number):BeliefFoldResult {
  const ordered=[...events].filter(e=>e.effectiveSequence<=targetSequence).sort((a,b)=>a.effectiveSequence-b.effectiveSequence! || Date.parse(a.createdAt)-Date.parse(b.createdAt) || (a.id<b.id?-1:a.id>b.id?1:0));
  const rank={unknown:0,suspected:1,believed:2,known:3} as const; let level:BeliefLevel='unknown'; const applied:string[]=[];
  for(const event of ordered){const needs=level!==event.level&&(level==='disproven'||event.level==='disproven'||(level!=='disproven'&&event.level!=='disproven'&&rank[event.level]<rank[level]));if(needs&&event.downgradeReason===undefined)throw new BeliefPolicyError('INVALID_BELIEF_TRANSITION',`${level} to ${event.level} requires reason`);level=event.level;applied.push(event.id);}
  return {level,sourceEventId:applied.at(-1)??null,appliedEventIds:applied};
}
export function foldBeliefEvents(eventsInput:unknown,targetSequenceInput:unknown):BeliefFoldResult {
  try { const target=nonNegativeSafeInteger(targetSequenceInput,fail,'targetSequence'); const ids=new Set<string>(); const events=denseArray(eventsInput,fail,'events').map(parseEvent); for(const event of events){if(ids.has(event.id))return fail('duplicate event ID');ids.add(event.id);} return foldTyped(events,target); }
  catch(error){if(error instanceof BeliefPolicyError)throw error;return fail('belief input reflection failed');}
}
```

Create `canonical-timestamp.ts`:

```ts
const CANONICAL_UTC_MILLISECONDS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function parseCanonicalTimestamp(value:string):number|null {
  if(!CANONICAL_UTC_MILLISECONDS.test(value))return null;
  const milliseconds=Date.parse(value);
  return Number.isFinite(milliseconds)&&new Date(milliseconds).toISOString()===value?milliseconds:null;
}
```

- [ ] **Step 2: Add hostile and malformed-future matrix**

```ts
it.each([
  null, 1, Array(1), Object.assign([event()],{extra:true}),
  [null], [{...event(),extra:true}], [{...event(),effectiveSequence:'9'}],
  [event(),{...event({id:'future',effectiveSequence:99}),createdAt:'2026-07-22T09:10:11Z'}],
])('belief boundary rejects %# with owned error', (events) => {
  expect(() => foldBeliefEvents(events,1)).toThrow(BeliefPolicyError);
  expect(() => foldBeliefEvents(events,1)).not.toThrow(TypeError);
});
it.each([null,'1',-1,1.5])('rejects target %#', (target) => {
  expect(() => foldBeliefEvents([],target)).toThrow(BeliefPolicyError);
});
```

Retain deterministic order and transition tests. Run and commit.

---

### Task 4: Disclosure fold

**Files:** `disclosure-policy.ts`, `disclosure-fold.test.ts`.

- [ ] **Step 1: Implement exact discriminated parser before filtering**

```ts
import {denseArray,exactObject,nonEmptyString,nonNegativeSafeInteger,type Fail} from '../validation/exact.js';
import {parseCanonicalTimestamp} from './canonical-timestamp.js';
export type ReaderFactStatus='unknown'|'suspected'|'known'|'retracted';
type Base={readonly id:string;readonly factId:string;readonly effectiveSequence:number;readonly createdAt:string};
export type DisclosureEvent=(Base&{readonly kind:'disclose';readonly status:'suspected'|'known'})|(Base&{readonly kind:'retract';readonly retractsDisclosureId:string});
export type ReaderFactState={readonly status:'unknown';readonly sourceDisclosureId:null;readonly appliedEventIds:readonly string[]}|{readonly status:'suspected'|'known';readonly sourceDisclosureId:string;readonly appliedEventIds:readonly string[]}|{readonly status:'retracted';readonly sourceDisclosureId:string;readonly retractionId:string;readonly appliedEventIds:readonly string[]};
export type DisclosureErrorCode='INVALID_DISCLOSURE_EVENT'|'INVALID_DISCLOSURE_RETRACTION';
export class DisclosurePolicyError extends Error{constructor(readonly code:DisclosureErrorCode,message:string){super(message);this.name='DisclosurePolicyError';}}
const fail:Fail=m=>{throw new DisclosurePolicyError('INVALID_DISCLOSURE_EVENT',m);};
function eventKeys(raw:unknown,index:number):readonly string[]{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return fail(`events[${index}] must be object`);
  try{Reflect.ownKeys(raw);}catch{return fail(`events[${index}] reflection failed`);}
  let descriptor:PropertyDescriptor|undefined;try{descriptor=Object.getOwnPropertyDescriptor(raw,'kind');}catch{return fail('kind reflection failed');}
  if(descriptor===undefined||!descriptor.enumerable||!('value' in descriptor))return fail('kind must be enumerable data property');
  if(descriptor.value==='disclose')return ['kind','id','factId','effectiveSequence','createdAt','status'];
  if(descriptor.value==='retract')return ['kind','id','factId','effectiveSequence','createdAt','retractsDisclosureId'];
  return fail('unsupported disclosure kind');
}
function parseDisclosure(raw:unknown,index:number,factId:string):DisclosureEvent{
  const x=exactObject(raw,eventKeys(raw,index),fail,`events[${index}]`);const id=nonEmptyString(x.id,fail,'id');
  if(nonEmptyString(x.factId,fail,'factId')!==factId)return fail('event fact mismatch');
  const effectiveSequence=nonNegativeSafeInteger(x.effectiveSequence,fail,'effectiveSequence');const createdAt=nonEmptyString(x.createdAt,fail,'createdAt');if(parseCanonicalTimestamp(createdAt)===null)return fail('createdAt invalid');
  if(x.kind==='disclose'){if(x.status!=='suspected'&&x.status!=='known')return fail('status invalid');return {kind:'disclose',id,factId,effectiveSequence,createdAt,status:x.status};}
  return {kind:'retract',id,factId,effectiveSequence,createdAt,retractsDisclosureId:nonEmptyString(x.retractsDisclosureId,fail,'retractsDisclosureId')};
}
function foldDisclosureTyped(events:readonly DisclosureEvent[],target:number):ReaderFactState{
  const ordered=[...events].filter(e=>e.effectiveSequence<=target).sort((a,b)=>a.effectiveSequence-b.effectiveSequence||Date.parse(a.createdAt)-Date.parse(b.createdAt)||(a.id<b.id?-1:a.id>b.id?1:0));
  let state:ReaderFactState={status:'unknown',sourceDisclosureId:null,appliedEventIds:[]};const disclosed=new Set<string>();const applied:string[]=[];
  for(const event of ordered){if(event.kind==='disclose'){disclosed.add(event.id);applied.push(event.id);state={status:event.status,sourceDisclosureId:event.id,appliedEventIds:[...applied]};continue;}if(!disclosed.has(event.retractsDisclosureId)||state.status==='unknown'||state.status==='retracted'||state.sourceDisclosureId!==event.retractsDisclosureId)throw new DisclosurePolicyError('INVALID_DISCLOSURE_RETRACTION','retraction must target active disclosure');applied.push(event.id);state={status:'retracted',sourceDisclosureId:event.retractsDisclosureId,retractionId:event.id,appliedEventIds:[...applied]};}
  return state;
}
export function foldDisclosureEvents(eventsInput:unknown,factIdInput:unknown,targetInput:unknown):ReaderFactState{
  try{const factId=nonEmptyString(factIdInput,fail,'factId'),target=nonNegativeSafeInteger(targetInput,fail,'targetSequence'),ids=new Set<string>();const events=denseArray(eventsInput,fail,'events').map((raw,index)=>parseDisclosure(raw,index,factId));for(const event of events){if(ids.has(event.id))return fail('duplicate event ID');ids.add(event.id);}return foldDisclosureTyped(events,target);}catch(error){if(error instanceof DisclosurePolicyError)throw error;return fail('disclosure input invalid');}
}
```

Parser and typed fold remain module-private.

- [ ] **Step 2: Add complete hostile matrix**

```ts
it.each([
  null, 1, Array(1), Object.assign([disclosed('d1',1)],{extra:true}),
  [null], [{...disclosed('d1',1),extra:true}],
  [Object.defineProperty({...disclosed('d1',1)},'status',{get:()=> 'known',enumerable:true})],
  [disclosed('d1',1),{...disclosed('future',99),createdAt:'bad'}],
  [{...disclosed('future',99),status:3}],
])('disclosure rejects hostile/future events %#', (events) => {
  expect(() => foldDisclosureEvents(events,'fact-1',1)).toThrow(DisclosurePolicyError);
  expect(() => foldDisclosureEvents(events,'fact-1',1)).not.toThrow(TypeError);
});
it.each([[[],null,1],[[],'',1],[[],'fact-1','1']])('rejects malformed scalar arguments %#',(args)=>{
  expect(() => foldDisclosureEvents(...(args as [unknown,unknown,unknown]))).toThrow(DisclosurePolicyError);
});
```

Retain deterministic folding and active-retraction assertions. Run and commit.

---

### Task 5: Foundation readiness

**Files:** `readiness-policy.ts`, `foundation-readiness.test.ts`.

- [ ] **Step 1: Parse complete snapshot before scoring**

`calculateFoundationReadiness(input: unknown)` calls `parseReadiness(input)` and private `calculateTyped`. Implement parser with:

```ts
const ROOT=['coreConcept','mainCharacter','relationships','conflict','endingDirection','readerPromise','secrets'] as const;
function parseReadiness(input:unknown):FoundationReadinessInput {
  try {
    const root=exactObject(input,ROOT,fail,'readiness input');
    const main=root.mainCharacter===null?null:(()=>{const x=exactObject(root.mainCharacter,['id','active','identity','goal','motivation','address','speechStyle'],fail,'mainCharacter');return {id:nonEmptyString(x.id,fail,'mainCharacter.id'),active:booleanValue(x.active,fail,'mainCharacter.active'),identity:nullableString(x.identity,fail,'identity'),goal:nullableString(x.goal,fail,'goal'),motivation:nullableString(x.motivation,fail,'motivation'),address:nullableString(x.address,fail,'address'),speechStyle:nullableString(x.speechStyle,fail,'speechStyle')};})();
    const relationships=denseArray(root.relationships,fail,'relationships').map((raw,i)=>{const x=exactObject(raw,['fromCharacterId','toCharacterId','active','description'],fail,`relationships[${i}]`);return {fromCharacterId:nonEmptyString(x.fromCharacterId,fail,'fromCharacterId'),toCharacterId:nonEmptyString(x.toCharacterId,fail,'toCharacterId'),active:booleanValue(x.active,fail,'active'),description:nullableString(x.description,fail,'description')};});
    const secrets=denseArray(root.secrets,fail,'secrets').map((raw,i)=>{const x=exactObject(raw,['truth','targetPosition','breadcrumbPositions'],fail,`secrets[${i}]`);const targetPosition=x.targetPosition===null?null:parseOwnedPosition(x.targetPosition,fail);const breadcrumbPositions=denseArray(x.breadcrumbPositions,fail,`secrets[${i}].breadcrumbPositions`).map(value=>parseOwnedPosition(value,fail));return {truth:nullableString(x.truth,fail,'truth'),targetPosition,breadcrumbPositions};});
    return {coreConcept:nullableString(root.coreConcept,fail,'coreConcept'),mainCharacter:main,relationships,conflict:nullableString(root.conflict,fail,'conflict'),endingDirection:nullableString(root.endingDirection,fail,'endingDirection'),readerPromise:nullableString(root.readerPromise,fail,'readerPromise'),secrets};
  } catch(error){if(error instanceof FoundationReadinessError)throw error;return fail('readiness reflection failed');}
}
export const calculateFoundationReadiness=(input:unknown):ReadinessResult=>calculateTyped(parseReadiness(input));
```

Define `FoundationReadinessError` with code `INVALID_FOUNDATION_READINESS_INPUT`; `parseOwnedPosition` catches `NarrativePositionError` and calls readiness `fail`. Keep original fixed 20/15/10/15/10/10/5/5/10 scoring, but remove its `try/catch` downgrade behavior: malformed positions now fail boundary, while valid duplicate/at-or-after breadcrumbs remain valid input that earns target points but no breadcrumb points.

- [ ] **Step 2: Add hostile nested matrix**

```ts
it.each([
  ...hostileObjects(blank).slice(0,-1),
  {...blank,relationships:Array(1)}, {...blank,relationships:[{fromCharacterId:'a',toCharacterId:'b',active:true,description:null,extra:1}]},
  {...blank,mainCharacter:{id:'m',active:'yes',identity:null,goal:null,motivation:null,address:null,speechStyle:null}},
  {...blank,secrets:[{truth:'x',targetPosition:{chapterId:'c',sequence:'future'},breadcrumbPositions:[]}]},
  {...blank,secrets:[{truth:'x',targetPosition:null,breadcrumbPositions:[null]}]},
])('readiness rejects hostile snapshot %#',input=>{
  expect(()=>calculateFoundationReadiness(input)).toThrow(FoundationReadinessError);
  expect(()=>calculateFoundationReadiness(input)).not.toThrow(TypeError);
});
```

Retain exact score/order/recommendation tests. Run and commit.

---

### Task 6: Canonical JSON and SHA-256

**Files:** `canonical-json.ts`, `canonical-json.test.ts`.

Expression/canonical boundaries are already hardened. Preserve locked canonical grammar and tests unchanged except shared-helper imports that do not alter accepted values. Required implementation remains concrete:

```ts
import { createHash } from 'node:crypto';
export class CanonicalJsonError extends Error{readonly code='INVALID_CANONICAL_VALUE' as const;constructor(message:string){super(message);this.name='CanonicalJsonError';}}
const fail=(message:string):never=>{throw new CanonicalJsonError(message);};
const wellFormed=(value:string):boolean=>{for(let i=0;i<value.length;i+=1){const unit=value.charCodeAt(i);if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(i+1);if(!(next>=0xdc00&&next<=0xdfff))return false;i+=1;}else if(unit>=0xdc00&&unit<=0xdfff)return false;}return true;};
export function canonicalJson(value:unknown):string {
  const active=new Set<object>();
  const serialize=(item:unknown):string=>{
    if(item===null||typeof item==='boolean')return JSON.stringify(item);
    if(typeof item==='string')return wellFormed(item)?JSON.stringify(item):fail('lone surrogate');
    if(typeof item==='number')return Number.isSafeInteger(item)?JSON.stringify(item):fail('number must be safe integer');
    if(typeof item!=='object')return fail('unsupported value');
    if(active.has(item))return fail('cyclic value');active.add(item);
    try {
      if(Array.isArray(item))return `[${denseArray(item,fail,'canonical array').map(serialize).join(',')}]`;
      const record=exactObject(item,Reflect.ownKeys(item).map(key=>typeof key==='string'?key:fail('symbol key')),fail,'canonical object');
      return `{${Object.entries(record).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>`${serialize(key)}:${serialize(entry)}`).join(',')}}`;
    } catch(error){if(error instanceof CanonicalJsonError)throw error;return fail('canonical reflection failed');}
    finally{active.delete(item);}
  };
  return serialize(value);
}
export function sha256Hex(value:unknown):string{if(typeof value!=='string')return fail('hash input must be string');return createHash('sha256').update(value,'utf8').digest('hex');}
export const canonicalSha256=(value:unknown):string=>sha256Hex(canonicalJson(value));
```

Tests include unsupported primitives, unsafe numbers, lone surrogates, cycles, class/null-prototype objects, symbols, non-enumerables, accessors with zero getter reads, sparse/wrong arrays, named array properties, proxy reflection failures, and known hash fixtures. Every assertion expects `CanonicalJsonError`, never `TypeError`. No other task exposes `CanonicalJsonError` for its boundary.

---

### Task 7: Dependency manifest and hash

**Files:** `dependency-manifest.ts`, `dependency-hash.test.ts`.

- [ ] **Step 1: Implement owned manifest parser**

```ts
import { booleanValue, denseArray, exactObject, nonEmptyString, nonNegativeSafeInteger, type Fail } from '../validation/exact.js';
import { canonicalJson, sha256Hex } from './canonical-json.js';
export interface DependencyEntry{readonly entityType:string;readonly entityId:string;readonly revision:number;readonly contentHash?:string;readonly deleted:boolean}
export type DependencyManifest=readonly DependencyEntry[];
export type DependencyManifestErrorCode='INVALID_DEPENDENCY'|'DUPLICATE_DEPENDENCY';
export class DependencyManifestError extends Error{constructor(readonly code:DependencyManifestErrorCode,message:string){super(message);this.name='DependencyManifestError';}}
const SHA=/^[0-9a-f]{64}$/; const fail:Fail=m=>{throw new DependencyManifestError('INVALID_DEPENDENCY',m);};
function parseEntry(raw:unknown,index:number):DependencyEntry{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return fail(`entries[${index}] invalid`);
  let keys:readonly PropertyKey[];try{keys=Reflect.ownKeys(raw);}catch{return fail('entry reflection failed');}
  const expected=keys.includes('contentHash')?['entityType','entityId','revision','contentHash','deleted']:['entityType','entityId','revision','deleted'];
  const x=exactObject(raw,expected,fail,`entries[${index}]`);const base={entityType:nonEmptyString(x.entityType,fail,'entityType'),entityId:nonEmptyString(x.entityId,fail,'entityId'),revision:nonNegativeSafeInteger(x.revision,fail,'revision'),deleted:booleanValue(x.deleted,fail,'deleted')};
  if(!expected.includes('contentHash'))return base;if(typeof x.contentHash!=='string'||!SHA.test(x.contentHash))return fail('contentHash must be lowercase SHA-256');return {...base,contentHash:x.contentHash};
}
function keyTyped(entry:Pick<DependencyEntry,'entityType'|'entityId'>):string{return canonicalJson([entry.entityType,entry.entityId]);}
export function dependencyKey(input:unknown):string{try{const x=exactObject(input,['entityType','entityId'],fail,'dependency key');return keyTyped({entityType:nonEmptyString(x.entityType,fail,'entityType'),entityId:nonEmptyString(x.entityId,fail,'entityId')});}catch(error){if(error instanceof DependencyManifestError)throw error;return fail('dependency key invalid');}}
export function buildDependencyManifest(input:unknown):DependencyManifest{try{const seen=new Set<string>();const entries=denseArray(input,fail,'manifest').map(parseEntry);for(const entry of entries){const key=keyTyped(entry);if(seen.has(key))throw new DependencyManifestError('DUPLICATE_DEPENDENCY',`duplicate ${key}`);seen.add(key);}return [...entries].sort((a,b)=>(a.entityType<b.entityType?-1:a.entityType>b.entityType?1:0)||(a.entityId<b.entityId?-1:a.entityId>b.entityId?1:0));}catch(error){if(error instanceof DependencyManifestError)throw error;return fail('manifest invalid');}}
export function dependencyManifestHash(input:unknown):string{try{return sha256Hex(`narraza-dependency-manifest:v1\n${canonicalJson(buildDependencyManifest(input))}`);}catch(error){if(error instanceof DependencyManifestError)throw error;return fail('manifest hash input invalid');}}
```

- [ ] **Step 2: Add hostile matrix**

```ts
it.each([
  null,1,Array(1),Object.assign([...entries],{extra:true}),
  [{...entries[0],extra:true}],
  [Object.defineProperty({...entries[0]},'revision',{get:()=>0,enumerable:true})],
  [{...entries[0],revision:'0'}],[{...entries[0],deleted:0}],[{...entries[0],contentHash:'ABC'}],
])('manifest APIs reject hostile input %#',input=>{
  expect(()=>buildDependencyManifest(input)).toThrow(DependencyManifestError);
  expect(()=>dependencyManifestHash(input)).toThrow(DependencyManifestError);
  expect(()=>buildDependencyManifest(input)).not.toThrow(TypeError);
});
it.each([null,1,{entityType:'fact',entityId:'1',extra:true},{entityType:'fact',entityId:3}])('dependencyKey rejects %#',input=>expect(()=>dependencyKey(input)).toThrow(DependencyManifestError));
```

Add canonical regression coverage before running:

```ts
it('preserves an own __proto__ data key', () => {
  const value = Object.create(Object.prototype) as Record<string, unknown>;
  Object.defineProperty(value, '__proto__', {
    value: 'kept',
    enumerable: true,
    configurable: true,
    writable: true,
  });
  expect(canonicalJson(value)).toBe('{"__proto__":"kept"}');
  expect(canonicalJson(value)).not.toBe(canonicalJson({}));
});
```

Retain ordering, duplicate, prefix, and permutation tests. Run and commit.

---

### Task 8: Stale applicability

**Files:** `stale-policy.ts`, `stale-policy.test.ts`.

- [ ] **Step 1: Validate all three arguments before comparison**

```ts
import { booleanValue,denseArray,exactObject,type Fail } from '../validation/exact.js';
import { canonicalJson } from './canonical-json.js';
import { buildDependencyManifest,dependencyKey,type DependencyManifest,DependencyManifestError } from './dependency-manifest.js';
export interface DependencyApplicability{readonly targetExists:boolean;readonly targetDeleted:boolean;readonly targetIdentityUnchanged:boolean;readonly expectedRevisionMatches:boolean;readonly relevantDependencyKeys:readonly string[]}
export type DependencyStatus='current'|'needs_revalidation'|'stale';export interface DependencyStatusResult{readonly status:DependencyStatus;readonly changedDependencyKeys:readonly string[]}
export class StalePolicyError extends Error{readonly code='INVALID_DEPENDENCY_APPLICABILITY' as const;constructor(message:string){super(message);this.name='StalePolicyError';}}
const fail:Fail=m=>{throw new StalePolicyError(m);};
function manifest(value:unknown,label:string):DependencyManifest{try{return buildDependencyManifest(value);}catch{return fail(`${label} invalid`);}}
function parseApplicability(value:unknown):DependencyApplicability{const x=exactObject(value,['targetExists','targetDeleted','targetIdentityUnchanged','expectedRevisionMatches','relevantDependencyKeys'],fail,'applicability');return {targetExists:booleanValue(x.targetExists,fail,'targetExists'),targetDeleted:booleanValue(x.targetDeleted,fail,'targetDeleted'),targetIdentityUnchanged:booleanValue(x.targetIdentityUnchanged,fail,'targetIdentityUnchanged'),expectedRevisionMatches:booleanValue(x.expectedRevisionMatches,fail,'expectedRevisionMatches'),relevantDependencyKeys:denseArray(x.relevantDependencyKeys,fail,'relevantDependencyKeys').map((key,i)=>typeof key==='string'?key:fail(`relevantDependencyKeys[${i}] invalid`))};}
function evaluateTyped(proposal:DependencyManifest,current:DependencyManifest,a:DependencyApplicability):DependencyStatusResult{if((!a.targetExists&&a.targetDeleted)||(!a.targetExists&&(a.targetIdentityUnchanged||a.expectedRevisionMatches))||(a.targetDeleted&&a.expectedRevisionMatches))return fail('contradictory target metadata');const all=new Set([...proposal.map(e=>dependencyKey({entityType:e.entityType,entityId:e.entityId})),...current.map(e=>dependencyKey({entityType:e.entityType,entityId:e.entityId}))]);const relevant=new Set<string>();for(const key of a.relevantDependencyKeys){if(relevant.has(key)||!all.has(key))return fail('relevant key duplicate or unknown');relevant.add(key);}const before=new Map(proposal.map(e=>[dependencyKey({entityType:e.entityType,entityId:e.entityId}),canonicalJson(e)]));const after=new Map(current.map(e=>[dependencyKey({entityType:e.entityType,entityId:e.entityId}),canonicalJson(e)]));const changed=[...all].filter(k=>before.get(k)!==after.get(k)).sort();if(!a.targetExists||a.targetDeleted||!a.targetIdentityUnchanged||!a.expectedRevisionMatches)return {status:'stale',changedDependencyKeys:changed};return {status:changed.some(k=>relevant.has(k))?'needs_revalidation':'current',changedDependencyKeys:changed};}
export function evaluateDependencyStatus(proposalInput:unknown,currentInput:unknown,applicabilityInput:unknown):DependencyStatusResult{try{const proposal=manifest(proposalInput,'proposal');const current=manifest(currentInput,'current');const applicability=parseApplicability(applicabilityInput);return evaluateTyped(proposal,current,applicability);}catch(error){if(error instanceof StalePolicyError)throw error;return fail('stale policy input invalid');}}
```

- [ ] **Step 2: Add hostile matrix**

```ts
it.each([
  null,1,{...valid,extra:true},{...valid,targetExists:'yes'},
  {...valid,relevantDependencyKeys:Array(1)},
  {...valid,relevantDependencyKeys:Object.assign([factKey],{extra:true})},
])('rejects hostile applicability %#',a=>{expect(()=>evaluateDependencyStatus(proposal,proposal,a)).toThrow(StalePolicyError);expect(()=>evaluateDependencyStatus(proposal,proposal,a)).not.toThrow(TypeError);});
it.each([null,1,Array(1),[{entityType:'fact',entityId:'future',revision:'2',deleted:false}]])('translates bad manifests %#',manifest=>expect(()=>evaluateDependencyStatus(manifest,proposal,valid)).toThrow(StalePolicyError));
```

Retain complete status/contradiction/relevant-key truth table. Run and commit.

---

### Task 9: Prose policies

**Files:** `prose-policy.ts`, `prose-policy.test.ts`.

- [ ] **Step 1: Give each public decision an exact parser**

```ts
import { exactObject,nonEmptyString,nonNegativeSafeInteger,type Fail } from '../validation/exact.js';
export type ProsePolicyErrorCode='INVALID_PROSE_POLICY_INPUT'|'ACCEPTED_PROSE_IMMUTABLE'|'WORKING_DRAFT_REVISION_MISMATCH'|'PROSE_VERSION_BEAT_MISMATCH';
export class ProsePolicyError extends Error{constructor(readonly code:ProsePolicyErrorCode,message:string){super(message);this.name='ProsePolicyError';}}
const SHA=/^[0-9a-f]{64}$/;const fail:Fail=m=>{throw new ProsePolicyError('INVALID_PROSE_POLICY_INPUT',m);};const hash=(v:unknown,l:string):string=>typeof v==='string'&&SHA.test(v)?v:fail(`${l} invalid`);
export function assertAcceptedProseImmutable(input:unknown):{readonly allowed:true}{try{const x=exactObject(input,['acceptedContentHash','proposedContentHash'],fail,'accepted prose');const a=hash(x.acceptedContentHash,'acceptedContentHash'),b=hash(x.proposedContentHash,'proposedContentHash');if(a!==b)throw new ProsePolicyError('ACCEPTED_PROSE_IMMUTABLE','accepted prose cannot change');return {allowed:true};}catch(e){if(e instanceof ProsePolicyError)throw e;return fail('accepted prose input invalid');}}
export function decideWorkingDraftUpdate(input:unknown):{readonly allowed:true;readonly nextRevision:number}{try{const x=exactObject(input,['currentRevision','expectedRevision'],fail,'draft update');const current=nonNegativeSafeInteger(x.currentRevision,fail,'currentRevision'),expected=nonNegativeSafeInteger(x.expectedRevision,fail,'expectedRevision');if(current!==expected)throw new ProsePolicyError('WORKING_DRAFT_REVISION_MISMATCH','revision mismatch');if(current===Number.MAX_SAFE_INTEGER)return fail('next revision unsafe');return {allowed:true,nextRevision:current+1};}catch(e){if(e instanceof ProsePolicyError)throw e;return fail('draft input invalid');}}
export function decideAcceptedPointer(input:unknown):{readonly allowed:true;readonly proseVersionId:string}{try{const x=exactObject(input,['beatId','proseVersionId','proseVersionBeatId'],fail,'accepted pointer');const beat=nonEmptyString(x.beatId,fail,'beatId'),id=nonEmptyString(x.proseVersionId,fail,'proseVersionId'),owner=nonEmptyString(x.proseVersionBeatId,fail,'proseVersionBeatId');if(beat!==owner)throw new ProsePolicyError('PROSE_VERSION_BEAT_MISMATCH','prose version belongs to another beat');return {allowed:true,proseVersionId:id};}catch(e){if(e instanceof ProsePolicyError)throw e;return fail('pointer input invalid');}}
export function isValidationBindingCurrent(input:unknown):boolean{try{const x=exactObject(input,['validationContentHash','currentContentHash'],fail,'validation binding');return hash(x.validationContentHash,'validationContentHash')===hash(x.currentContentHash,'currentContentHash');}catch(e){if(e instanceof ProsePolicyError)throw e;return fail('binding input invalid');}}
```

- [ ] **Step 2: Matrix every prose boundary**

```ts
const cases=[
  [assertAcceptedProseImmutable,{acceptedContentHash:hashA,proposedContentHash:hashA}],
  [decideWorkingDraftUpdate,{currentRevision:1,expectedRevision:1}],
  [decideAcceptedPointer,{beatId:'b',proseVersionId:'p',proseVersionBeatId:'b'}],
  [isValidationBindingCurrent,{validationContentHash:hashA,currentContentHash:hashA}],
] as const;
for(const [fn,valid] of cases){it.each([...hostileObjects(valid).slice(0,-1)])(`${fn.name} rejects hostile %#`,input=>{expect(()=>fn(input as never)).toThrow(ProsePolicyError);expect(()=>fn(input as never)).not.toThrow(TypeError);});}
it.each([[decideWorkingDraftUpdate,{currentRevision:'1',expectedRevision:1}],[decideAcceptedPointer,{beatId:3,proseVersionId:'p',proseVersionBeatId:'b'}],[isValidationBindingCurrent,{validationContentHash:'A',currentContentHash:hashA}]])('rejects nested/scalar mismatch',([fn,input])=>expect(()=>fn(input as never)).toThrow(ProsePolicyError));
```

Retain semantic mismatch and success tests. Run and commit.

---

### Task 10: Repair fingerprint and stopping

**Files:** `repair-policy.ts`, `repair-policy.test.ts`.

- [ ] **Step 1: Parse blockers and stop input before reads**

```ts
import { denseArray,exactObject,nonEmptyString,nonNegativeSafeInteger,type Fail } from '../validation/exact.js';
import { canonicalJson,canonicalSha256 } from '../dependency/canonical-json.js';
export interface RepairFindingLocation{readonly startUtf16:number;readonly endUtf16:number}export interface RepairBlocker{readonly ruleKey:string;readonly location:RepairFindingLocation|null;readonly evidenceHash?:string;readonly severityScore:number}export type RepairStopReason='all_blocking_resolved'|'regression'|'same_findings_repeated'|'no_progress'|'attempt_limit'|'continue';export interface RepairStopDecision{readonly reason:RepairStopReason;readonly shouldStop:boolean;readonly currentFingerprint:string}
export type RepairPolicyErrorCode='INVALID_REPAIR_POLICY_INPUT'|'DUPLICATE_REPAIR_BLOCKER';export class RepairPolicyError extends Error{constructor(readonly code:RepairPolicyErrorCode,message:string){super(message);this.name='RepairPolicyError';}}
const SHA=/^[0-9a-f]{64}$/;const fail:Fail=m=>{throw new RepairPolicyError('INVALID_REPAIR_POLICY_INPUT',m);};
function blocker(raw:unknown,index:number):RepairBlocker{if(raw===null||typeof raw!=='object'||Array.isArray(raw))return fail(`blockers[${index}] invalid`);let keys:readonly PropertyKey[];try{keys=Reflect.ownKeys(raw);}catch{return fail('blocker reflection failed');}const expected=keys.includes('evidenceHash')?['ruleKey','location','evidenceHash','severityScore']:['ruleKey','location','severityScore'];const x=exactObject(raw,expected,fail,`blockers[${index}]`);const location=x.location===null?null:(()=>{const p=exactObject(x.location,['startUtf16','endUtf16'],fail,'location');const startUtf16=nonNegativeSafeInteger(p.startUtf16,fail,'startUtf16'),endUtf16=nonNegativeSafeInteger(p.endUtf16,fail,'endUtf16');if(endUtf16<startUtf16)return fail('location end before start');return {startUtf16,endUtf16};})();const base={ruleKey:nonEmptyString(x.ruleKey,fail,'ruleKey'),location,severityScore:nonNegativeSafeInteger(x.severityScore,fail,'severityScore')};if(!expected.includes('evidenceHash'))return base;if(typeof x.evidenceHash!=='string'||!SHA.test(x.evidenceHash))return fail('evidenceHash invalid');return {...base,evidenceHash:x.evidenceHash};}
function blockers(value:unknown,label:string):readonly RepairBlocker[]{const parsed=denseArray(value,fail,label).map(blocker);const seen=new Set<string>();for(const item of parsed){const identity=canonicalJson({ruleKey:item.ruleKey,location:item.location,evidenceHash:item.evidenceHash??null});if(seen.has(identity))throw new RepairPolicyError('DUPLICATE_REPAIR_BLOCKER','duplicate blocker');seen.add(identity);}return parsed;}
function fingerprintTyped(items:readonly RepairBlocker[]):string{const entries=items.map(item=>({ruleKey:item.ruleKey,location:item.location,evidenceHash:item.evidenceHash??null})).sort((a,b)=>{const x=canonicalJson(a),y=canonicalJson(b);return x<y?-1:x>y?1:0;});return canonicalSha256(entries);}
export function repairBlockerFingerprint(input:unknown):string{try{return fingerprintTyped(blockers(input,'blockers'));}catch(e){if(e instanceof RepairPolicyError)throw e;return fail('fingerprint input invalid');}}
export function decideRepairStop(input:unknown):RepairStopDecision{try{const x=exactObject(input,['previousBlockers','currentBlockers','completedAttempts','maxAttempts'],fail,'repair stop');const previous=blockers(x.previousBlockers,'previousBlockers'),current=blockers(x.currentBlockers,'currentBlockers'),completed=nonNegativeSafeInteger(x.completedAttempts,fail,'completedAttempts'),max=nonNegativeSafeInteger(x.maxAttempts,fail,'maxAttempts');if(max===0)return fail('maxAttempts must be positive');const pf=fingerprintTyped(previous),cf=fingerprintTyped(current),ps=previous.reduce((s,b)=>s+b.severityScore,0),cs=current.reduce((s,b)=>s+b.severityScore,0);if(!Number.isSafeInteger(ps)||!Number.isSafeInteger(cs))return fail('severity total unsafe');const reason:RepairStopReason=current.length===0?'all_blocking_resolved':current.length>previous.length||cs>ps?'regression':cf===pf?'same_findings_repeated':current.length>=previous.length&&cs>=ps?'no_progress':completed>=max?'attempt_limit':'continue';return {reason,shouldStop:reason!=='continue',currentFingerprint:cf};}catch(e){if(e instanceof RepairPolicyError)throw e;return fail('repair stop input invalid');}}
```

- [ ] **Step 2: Add both boundary matrices**

```ts
it.each([null,1,Array(1),Object.assign([blocker('a')],{extra:true}),[{...blocker('a'),extra:true}],[{...blocker('a'),location:{startUtf16:'1',endUtf16:3}}],[{...blocker('a'),evidenceHash:'A'}]])('fingerprint rejects hostile %#',input=>{expect(()=>repairBlockerFingerprint(input)).toThrow(RepairPolicyError);expect(()=>repairBlockerFingerprint(input)).not.toThrow(TypeError);});
it.each([...hostileObjects(validStop).slice(0,-1),{...validStop,currentBlockers:Array(1)},{...validStop,completedAttempts:'1'},{...validStop,currentBlockers:[{...blocker('future'),severityScore:'4'}]}])('stop rejects hostile/future %#',input=>{expect(()=>decideRepairStop(input)).toThrow(RepairPolicyError);expect(()=>decideRepairStop(input)).not.toThrow(TypeError);});
```

Retain six-reason precedence, order-independent fingerprint, duplicate, and bounds tests. Run and commit.

---

### Task 11: Explicit public barrels

Create explicit `narrative`, `foundation`, `dependency`, and `prose` barrels. Export only public types, owned errors, and these runtime functions:

```ts
// narrative
createNarrativePosition; compareNarrativePositions; narrativePositionsEqual;
buildRevealViews; decideExpression; foldBeliefEvents; foldDisclosureEvents;
// foundation
calculateFoundationReadiness;
// dependency
canonicalJson; canonicalSha256; sha256Hex; dependencyKey; buildDependencyManifest;
dependencyManifestHash; evaluateDependencyStatus;
// prose
assertAcceptedProseImmutable; decideWorkingDraftUpdate; decideAcceptedPointer;
isValidationBindingCurrent; repairBlockerFingerprint; decideRepairStop;
```

Do not export `exactObject`, `denseArray`, task parsers, canonical timestamp parser, or typed decision helpers from package root. Preserve existing `auth` namespace. Run core tests/build and `pnpm arch`; commit barrels.

---

### Task 12: Full verification and scope audit

- [ ] Run all 11 W1.2 test files plus shared hostile fixture compilation. Expected: all pass; every hostile matrix asserts task-owned error and `not.toThrow(TypeError)`.
- [ ] Run:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm arch
pnpm test:unit
```

Expected: all exit 0.

- [ ] Audit runtime signatures and unsafe reads:

```bash
rg -n "export function|export const" packages/core/src/{narrative,foundation,dependency,prose}
rg -n "Object\.keys\(|localeCompare|Math\.random|@prisma|next/|react|fetch\(" packages/core/src/{narrative,foundation,dependency,prose,validation}
```

Expected: every runtime-facing parameter is `unknown`; no `Object.keys`, locale ordering, randomness, framework, DB, or network match. Internal typed helpers are not exported.

- [ ] Audit hostile coverage:

```bash
rg -n "hostile|sparse|accessor|non-enumerable|symbol|future|not\.toThrow\(TypeError\)" packages/core/src/{narrative,foundation,dependency,prose}/*.test.ts
```

Expected: every public boundary has null/primitive, exact-object descriptor, dense/wrong-array where applicable, nested wrong-type, and malformed-future coverage.

- [ ] Format and diff check:

```bash
pnpm exec prettier --write docs/verification-matrix.md packages/core/src/validation packages/core/src/narrative packages/core/src/foundation packages/core/src/dependency packages/core/src/prose packages/core/src/index.ts
pnpm exec prettier --check docs/verification-matrix.md packages/core/src/validation packages/core/src/narrative packages/core/src/foundation packages/core/src/dependency packages/core/src/prose packages/core/src/index.ts
git diff --check master...HEAD
git diff --name-only master...HEAD
```

Expected: Prettier check passes; diff check prints nothing; names are limited to plan file map. Do not update `docs/PROGRESS-CHECKLIST.md`.
