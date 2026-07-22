import {
  denseArray,
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';
import { canonicalJson, canonicalSha256 } from '../dependency/canonical-json.js';

export interface RepairFindingLocation {
  readonly startUtf16: number;
  readonly endUtf16: number;
}

export interface RepairBlocker {
  readonly ruleKey: string;
  readonly location: RepairFindingLocation | null;
  readonly evidenceHash?: string;
  readonly severityScore: number;
}

export type RepairStopReason =
  | 'all_blocking_resolved'
  | 'regression'
  | 'same_findings_repeated'
  | 'no_progress'
  | 'attempt_limit'
  | 'continue';

export interface RepairStopDecision {
  readonly reason: RepairStopReason;
  readonly shouldStop: boolean;
  readonly currentFingerprint: string;
}

export type RepairPolicyErrorCode = 'INVALID_REPAIR_POLICY_INPUT' | 'DUPLICATE_REPAIR_BLOCKER';

export class RepairPolicyError extends Error {
  constructor(
    readonly code: RepairPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepairPolicyError';
  }
}

const SHA_256 = /^[0-9a-f]{64}$/;
const fail: Fail = (message) => {
  throw new RepairPolicyError('INVALID_REPAIR_POLICY_INPUT', message);
};

function parseLocation(value: unknown, label: string): RepairFindingLocation | null {
  if (value === null) return null;
  const record = exactObject(value, ['startUtf16', 'endUtf16'], fail, label);
  const startUtf16 = nonNegativeSafeInteger(record.startUtf16, fail, `${label}.startUtf16`);
  const endUtf16 = nonNegativeSafeInteger(record.endUtf16, fail, `${label}.endUtf16`);
  if (endUtf16 < startUtf16) return fail(`${label} end before start`);
  return { startUtf16, endUtf16 };
}

function parseBlocker(raw: unknown, index: number, label: string): RepairBlocker {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(`${label}[${index}] invalid`);
  }

  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(raw);
  } catch {
    return fail(`${label}[${index}] reflection failed`);
  }
  const hasEvidenceHash = keys.includes('evidenceHash');
  const expectedKeys = hasEvidenceHash
    ? ['ruleKey', 'location', 'evidenceHash', 'severityScore']
    : ['ruleKey', 'location', 'severityScore'];
  const record = exactObject(raw, expectedKeys, fail, `${label}[${index}]`);
  const ruleKey = nonEmptyString(record.ruleKey, fail, `${label}[${index}].ruleKey`);
  const location = parseLocation(record.location, `${label}[${index}].location`);
  const severityScore = nonNegativeSafeInteger(
    record.severityScore,
    fail,
    `${label}[${index}].severityScore`,
  );

  if (!hasEvidenceHash) return { ruleKey, location, severityScore };
  const evidenceHash = record.evidenceHash;
  if (typeof evidenceHash !== 'string' || !SHA_256.test(evidenceHash)) {
    return fail(`${label}[${index}].evidenceHash invalid`);
  }
  return { ruleKey, location, evidenceHash, severityScore };
}

function identityMaterial(item: RepairBlocker): {
  readonly ruleKey: string;
  readonly location: RepairFindingLocation | null;
  readonly evidenceHash: string | null;
} {
  return {
    ruleKey: item.ruleKey,
    location: item.location,
    evidenceHash: item.evidenceHash ?? null,
  };
}

function parseBlockers(value: unknown, label: string): readonly RepairBlocker[] {
  const items = denseArray(value, fail, label).map((item, index) =>
    parseBlocker(item, index, label),
  );
  const seen = new Set<string>();

  for (const item of items) {
    const identity = canonicalJson(identityMaterial(item));
    if (seen.has(identity)) {
      throw new RepairPolicyError('DUPLICATE_REPAIR_BLOCKER', 'duplicate repair blocker');
    }
    seen.add(identity);
  }

  return items;
}

function fingerprint(items: readonly RepairBlocker[]): string {
  const entries = items.map(identityMaterial).sort((left, right) => {
    const leftJson = canonicalJson(left);
    const rightJson = canonicalJson(right);
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
  return canonicalSha256(entries);
}

function severityTotal(items: readonly RepairBlocker[], label: string): number {
  let total = 0;
  for (const item of items) {
    total += item.severityScore;
    if (!Number.isSafeInteger(total)) return fail(`${label} severity total unsafe`);
  }
  return total;
}

export function repairBlockerFingerprint(input: unknown): string {
  try {
    return fingerprint(parseBlockers(input, 'blockers'));
  } catch (error) {
    if (error instanceof RepairPolicyError) throw error;
    return fail('fingerprint input invalid');
  }
}

export function decideRepairStop(input: unknown): RepairStopDecision {
  try {
    const record = exactObject(
      input,
      ['previousBlockers', 'currentBlockers', 'completedAttempts', 'maxAttempts'],
      fail,
      'repair stop',
    );
    const previous = parseBlockers(record.previousBlockers, 'previousBlockers');
    const current = parseBlockers(record.currentBlockers, 'currentBlockers');
    const completedAttempts = nonNegativeSafeInteger(
      record.completedAttempts,
      fail,
      'completedAttempts',
    );
    const maxAttempts = nonNegativeSafeInteger(record.maxAttempts, fail, 'maxAttempts');
    if (maxAttempts === 0) return fail('maxAttempts must be positive');

    const previousSeverity = severityTotal(previous, 'previousBlockers');
    const currentSeverity = severityTotal(current, 'currentBlockers');
    const previousFingerprint = fingerprint(previous);
    const currentFingerprint = fingerprint(current);

    const reason: RepairStopReason =
      current.length === 0
        ? 'all_blocking_resolved'
        : current.length > previous.length || currentSeverity > previousSeverity
          ? 'regression'
          : currentFingerprint === previousFingerprint
            ? 'same_findings_repeated'
            : current.length >= previous.length && currentSeverity >= previousSeverity
              ? 'no_progress'
              : completedAttempts >= maxAttempts
                ? 'attempt_limit'
                : 'continue';

    return Object.freeze({
      reason,
      shouldStop: reason !== 'continue',
      currentFingerprint,
    });
  } catch (error) {
    if (error instanceof RepairPolicyError) throw error;
    return fail('repair stop input invalid');
  }
}
