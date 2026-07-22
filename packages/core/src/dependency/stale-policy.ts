import {
  booleanValue,
  denseArray,
  exactObject,
  nonEmptyString,
  type Fail,
} from '../validation/exact.js';
import { canonicalJson } from './canonical-json.js';
import {
  dependencyKey,
  validateDependencyManifest,
  type DependencyEntry,
  type DependencyManifest,
} from './dependency-manifest.js';

export interface DependencyApplicability {
  readonly targetExists: boolean;
  readonly targetDeleted: boolean;
  readonly targetIdentityUnchanged: boolean;
  readonly expectedRevisionMatches: boolean;
  readonly relevantDependencyKeys: readonly string[];
}

export type DependencyStatus = 'current' | 'needs_revalidation' | 'stale';

export interface DependencyStatusResult {
  readonly status: DependencyStatus;
  readonly changedDependencyKeys: readonly string[];
}

export class StalePolicyError extends Error {
  readonly code = 'INVALID_DEPENDENCY_APPLICABILITY' as const;

  constructor(message: string) {
    super(message);
    this.name = 'StalePolicyError';
  }
}

const fail: Fail = (message) => {
  throw new StalePolicyError(message);
};

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function parseManifest(value: unknown, label: string): DependencyManifest {
  try {
    return validateDependencyManifest(value);
  } catch {
    return fail(`${label} manifest invalid`);
  }
}

function parseApplicability(value: unknown): DependencyApplicability {
  const input = exactObject(
    value,
    [
      'targetExists',
      'targetDeleted',
      'targetIdentityUnchanged',
      'expectedRevisionMatches',
      'relevantDependencyKeys',
    ],
    fail,
    'applicability',
  );
  const relevantDependencyKeys = denseArray(
    input.relevantDependencyKeys,
    fail,
    'relevantDependencyKeys',
  ).map((key, index) => nonEmptyString(key, fail, `relevantDependencyKeys[${index}]`));

  return {
    targetExists: booleanValue(input.targetExists, fail, 'targetExists'),
    targetDeleted: booleanValue(input.targetDeleted, fail, 'targetDeleted'),
    targetIdentityUnchanged: booleanValue(
      input.targetIdentityUnchanged,
      fail,
      'targetIdentityUnchanged',
    ),
    expectedRevisionMatches: booleanValue(
      input.expectedRevisionMatches,
      fail,
      'expectedRevisionMatches',
    ),
    relevantDependencyKeys,
  };
}

function normalizeManifest(manifest: DependencyManifest): DependencyManifest {
  return Object.freeze(
    [...manifest].sort(
      (left, right) =>
        compareCodeUnits(left.entityType, right.entityType) ||
        compareCodeUnits(left.entityId, right.entityId),
    ),
  );
}

function dependencyKeyForEntry(entry: DependencyEntry): string {
  return dependencyKey({ entityType: entry.entityType, entityId: entry.entityId });
}

function entryTuple(entry: DependencyEntry): readonly unknown[] {
  return Object.prototype.hasOwnProperty.call(entry, 'contentHash')
    ? [entry.entityType, entry.entityId, entry.revision, entry.contentHash, entry.deleted]
    : [entry.entityType, entry.entityId, entry.revision, entry.deleted];
}

function frozenResult(
  status: DependencyStatus,
  changedDependencyKeys: readonly string[],
): DependencyStatusResult {
  return Object.freeze({
    status,
    changedDependencyKeys: Object.freeze([...changedDependencyKeys]),
  });
}

function evaluateTyped(
  proposal: DependencyManifest,
  current: DependencyManifest,
  applicability: DependencyApplicability,
): DependencyStatusResult {
  if (
    (!applicability.targetExists && applicability.targetDeleted) ||
    (!applicability.targetExists &&
      (applicability.targetIdentityUnchanged || applicability.expectedRevisionMatches)) ||
    (applicability.targetDeleted && applicability.expectedRevisionMatches)
  ) {
    return fail('contradictory target metadata');
  }

  const proposalEntries = new Map(
    normalizeManifest(proposal).map((entry) => [
      dependencyKeyForEntry(entry),
      canonicalJson(entryTuple(entry)),
    ]),
  );
  const currentEntries = new Map(
    normalizeManifest(current).map((entry) => [
      dependencyKeyForEntry(entry),
      canonicalJson(entryTuple(entry)),
    ]),
  );
  const allDependencyKeys = new Set([...proposalEntries.keys(), ...currentEntries.keys()]);
  const relevantDependencyKeys = new Set<string>();

  for (const key of applicability.relevantDependencyKeys) {
    if (relevantDependencyKeys.has(key)) return fail('relevant dependency key duplicate');
    if (!allDependencyKeys.has(key)) return fail('relevant dependency key unknown');
    relevantDependencyKeys.add(key);
  }

  const changedDependencyKeys = [...allDependencyKeys]
    .filter((key) => proposalEntries.get(key) !== currentEntries.get(key))
    .sort(compareCodeUnits);

  if (
    !applicability.targetExists ||
    applicability.targetDeleted ||
    !applicability.targetIdentityUnchanged ||
    !applicability.expectedRevisionMatches
  ) {
    return frozenResult('stale', changedDependencyKeys);
  }

  return frozenResult(
    changedDependencyKeys.some((key) => relevantDependencyKeys.has(key))
      ? 'needs_revalidation'
      : 'current',
    changedDependencyKeys,
  );
}

export function evaluateDependencyStatus(
  proposalInput: unknown,
  currentInput: unknown,
  applicabilityInput: unknown,
): DependencyStatusResult {
  try {
    const proposal = parseManifest(proposalInput, 'proposal');
    const current = parseManifest(currentInput, 'current');
    const applicability = parseApplicability(applicabilityInput);
    return evaluateTyped(proposal, current, applicability);
  } catch (error) {
    if (error instanceof StalePolicyError) throw error;
    return fail('stale policy input invalid');
  }
}
