import {
  booleanValue,
  denseArray,
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';
import { canonicalJson, sha256Hex } from './canonical-json.js';

export interface DependencyEntry {
  readonly entityType: string;
  readonly entityId: string;
  readonly revision: number;
  readonly contentHash?: string;
  readonly deleted: boolean;
}

export type DependencyManifest = readonly DependencyEntry[];
export type DependencyManifestErrorCode = 'INVALID_DEPENDENCY' | 'DUPLICATE_DEPENDENCY';

export class DependencyManifestError extends Error {
  constructor(
    readonly code: DependencyManifestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DependencyManifestError';
  }
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HASH_PREFIX = 'narraza-dependency-manifest:v1\n';
const fail: Fail = (message) => {
  throw new DependencyManifestError('INVALID_DEPENDENCY', message);
};

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function dependencyKeyTyped(entry: Pick<DependencyEntry, 'entityType' | 'entityId'>): string {
  return canonicalJson([entry.entityType, entry.entityId]);
}

function parseEntry(raw: unknown, index: number): DependencyEntry {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(`entries[${index}] invalid`);
  }

  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(raw);
  } catch {
    return fail(`entries[${index}] reflection failed`);
  }

  const hasContentHash = keys.includes('contentHash');
  const expectedKeys = hasContentHash
    ? ['entityType', 'entityId', 'revision', 'contentHash', 'deleted']
    : ['entityType', 'entityId', 'revision', 'deleted'];
  const entry = exactObject(raw, expectedKeys, fail, `entries[${index}]`);
  const base = {
    entityType: nonEmptyString(entry.entityType, fail, 'entityType'),
    entityId: nonEmptyString(entry.entityId, fail, 'entityId'),
    revision: nonNegativeSafeInteger(entry.revision, fail, 'revision'),
    deleted: booleanValue(entry.deleted, fail, 'deleted'),
  };

  if (!hasContentHash) return Object.freeze(base);
  if (typeof entry.contentHash !== 'string' || !SHA256_PATTERN.test(entry.contentHash)) {
    return fail('contentHash must be lowercase SHA-256');
  }
  return Object.freeze({ ...base, contentHash: entry.contentHash });
}

export function dependencyKey(input: unknown): string {
  try {
    const entry = exactObject(input, ['entityType', 'entityId'], fail, 'dependency key');
    return dependencyKeyTyped({
      entityType: nonEmptyString(entry.entityType, fail, 'entityType'),
      entityId: nonEmptyString(entry.entityId, fail, 'entityId'),
    });
  } catch (error) {
    if (error instanceof DependencyManifestError) throw error;
    return fail('dependency key invalid');
  }
}

export function validateDependencyManifest(input: unknown): DependencyManifest {
  try {
    const entries = denseArray(input, fail, 'manifest').map(parseEntry);
    const seen = new Set<string>();

    for (const entry of entries) {
      const key = dependencyKeyTyped(entry);
      if (seen.has(key)) {
        throw new DependencyManifestError('DUPLICATE_DEPENDENCY', `duplicate ${key}`);
      }
      seen.add(key);
    }
    return Object.freeze(entries);
  } catch (error) {
    if (error instanceof DependencyManifestError) throw error;
    return fail('manifest invalid');
  }
}

function normalizeDependencyManifest(manifest: DependencyManifest): DependencyManifest {
  return Object.freeze(
    [...manifest].sort(
      (left, right) =>
        compareCodeUnits(left.entityType, right.entityType) ||
        compareCodeUnits(left.entityId, right.entityId),
    ),
  );
}

export function buildDependencyManifest(input: unknown): DependencyManifest {
  return normalizeDependencyManifest(validateDependencyManifest(input));
}

export function dependencyManifestHash(input: unknown): string {
  try {
    return sha256Hex(`${HASH_PREFIX}${canonicalJson(buildDependencyManifest(input))}`);
  } catch (error) {
    if (error instanceof DependencyManifestError) throw error;
    return fail('manifest hash input invalid');
  }
}
