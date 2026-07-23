import { describe, expect, it } from 'vitest';
import { hostileArrays, hostileObjects } from '../validation/hostile-fixtures.test.js';
import {
  decideRepairStop,
  repairBlockerFingerprint,
  RepairPolicyError,
  type RepairBlocker,
  type RepairPolicyErrorCode,
  type RepairStopReason,
} from './repair-policy.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const blocker = (
  ruleKey: string,
  severityScore = 1,
  location: RepairBlocker['location'] = null,
  evidenceHash?: string,
): RepairBlocker => ({
  ruleKey,
  location,
  severityScore,
  ...(evidenceHash === undefined ? {} : { evidenceHash }),
});

const expectOwnedError = (
  action: () => unknown,
  code: RepairPolicyErrorCode = 'INVALID_REPAIR_POLICY_INPUT',
) => {
  expect(action).toThrow(RepairPolicyError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ name: 'RepairPolicyError', code });
  }
};

const blocked = (): never => {
  throw new Error('blocked');
};

const validStop = {
  previousBlockers: [blocker('previous', 2)],
  currentBlockers: [blocker('current', 1)],
  completedAttempts: 1,
  maxAttempts: 3,
};

describe('repair blocker fingerprint', () => {
  it('is order-independent and excludes severity from canonical identity', () => {
    const first = blocker('first', 1, { startUtf16: 0, endUtf16: 2 }, HASH_A);
    const second = blocker('second', 9);

    expect(repairBlockerFingerprint([first, second])).toBe(
      repairBlockerFingerprint([
        { ...second, severityScore: 100 },
        { ...first, severityScore: 0 },
      ]),
    );
  });

  it('uses evidenceHash null canonically when evidence is absent', () => {
    const withoutEvidence = repairBlockerFingerprint([blocker('same')]);
    const withEvidence = repairBlockerFingerprint([blocker('same', 1, null, HASH_A)]);

    expect(withoutEvidence).toMatch(/^[0-9a-f]{64}$/);
    expect(withoutEvidence).not.toBe(withEvidence);
  });

  it('rejects duplicate ruleKey, location, and evidence identity despite severity difference', () => {
    expectOwnedError(
      () => repairBlockerFingerprint([blocker('same', 1), blocker('same', 2)]),
      'DUPLICATE_REPAIR_BLOCKER',
    );
  });

  it.each([
    [blocker('bad', 1, { startUtf16: 3, endUtf16: 2 })],
    [blocker('bad', 1, { startUtf16: -1, endUtf16: 2 })],
    [blocker('bad', 1, { startUtf16: 0.5, endUtf16: 2 })],
    [blocker('bad', 1, { startUtf16: 0, endUtf16: Number.MAX_SAFE_INTEGER + 1 })],
    [blocker('bad', -1)],
    [blocker('bad', 0.5)],
    [blocker('bad', Number.MAX_SAFE_INTEGER + 1)],
    [blocker('bad', 1, null, HASH_A.toUpperCase())],
  ])('rejects invalid location, severity, or lowercase hash boundary %#', (input) => {
    expectOwnedError(() => repairBlockerFingerprint(input));
  });

  it.each([
    ...hostileArrays([blocker('a')]),
    Object.assign([blocker('a')], { extra: true }),
    [{ ...blocker('a'), extra: true }],
    [{ ...blocker('a'), location: { startUtf16: '1', endUtf16: 3 } }],
    [{ ...blocker('a'), evidenceHash: 'A' }],
  ])('rejects hostile or sparse fingerprint input %# with owned error', (input) => {
    expectOwnedError(() => repairBlockerFingerprint(input));
  });

  it('rejects blocker and location accessors without invoking getters', () => {
    let blockerReads = 0;
    const accessorBlocker = Object.defineProperty({ ...blocker('a') }, 'ruleKey', {
      get: () => {
        blockerReads += 1;
        return 'a';
      },
      enumerable: true,
    });
    let locationReads = 0;
    const accessorLocation = Object.defineProperty({ startUtf16: 0, endUtf16: 1 }, 'startUtf16', {
      get: () => {
        locationReads += 1;
        return 0;
      },
      enumerable: true,
    });

    expectOwnedError(() => repairBlockerFingerprint([accessorBlocker]));
    expectOwnedError(() =>
      repairBlockerFingerprint([blocker('located', 1, accessorLocation as never)]),
    );
    expect(blockerReads).toBe(0);
    expect(locationReads).toBe(0);
  });

  it('translates array, blocker, and location proxy failures to owned errors', () => {
    expectOwnedError(() => repairBlockerFingerprint(new Proxy([], { ownKeys: blocked })));
    expectOwnedError(() =>
      repairBlockerFingerprint([new Proxy({ ...blocker('a') }, { ownKeys: blocked })]),
    );
    expectOwnedError(() =>
      repairBlockerFingerprint([
        blocker('a', 1, new Proxy({ startUtf16: 0, endUtf16: 1 }, { ownKeys: blocked })),
      ]),
    );
  });
});

describe('repair stopping policy', () => {
  const cases: readonly [RepairStopReason, typeof validStop][] = [
    ['all_blocking_resolved', { ...validStop, currentBlockers: [] }],
    [
      'regression',
      {
        ...validStop,
        previousBlockers: [blocker('same', 1)],
        currentBlockers: [blocker('same', 2)],
      },
    ],
    [
      'same_findings_repeated',
      {
        ...validStop,
        previousBlockers: [blocker('same', 4)],
        currentBlockers: [blocker('same', 4)],
      },
    ],
    [
      'no_progress',
      {
        ...validStop,
        previousBlockers: [blocker('old', 2)],
        currentBlockers: [blocker('new', 2)],
      },
    ],
    [
      'attempt_limit',
      {
        ...validStop,
        previousBlockers: [blocker('old', 3)],
        currentBlockers: [blocker('new', 2)],
        completedAttempts: 3,
      },
    ],
    ['continue', validStop],
  ];

  it.each(cases)('chooses %s with exact priority and freezes decision', (reason, input) => {
    const decision = decideRepairStop(input);

    expect(decision).toEqual({
      reason,
      shouldStop: reason !== 'continue',
      currentFingerprint: repairBlockerFingerprint(input.currentBlockers),
    });
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it('treats increased blocker count as regression even when aggregate severity decreases', () => {
    expect(
      decideRepairStop({
        ...validStop,
        previousBlockers: [blocker('old', 10)],
        currentBlockers: [blocker('new-1', 1), blocker('new-2', 1)],
      }).reason,
    ).toBe('regression');
  });

  it('treats increased aggregate severity as regression even when blocker count decreases', () => {
    expect(
      decideRepairStop({
        ...validStop,
        previousBlockers: [blocker('old-1', 1), blocker('old-2', 1)],
        currentBlockers: [blocker('new', 3)],
      }).reason,
    ).toBe('regression');
  });

  it('prioritizes no progress over attempt limit when fingerprint changes without lower metrics', () => {
    expect(
      decideRepairStop({
        ...validStop,
        previousBlockers: [blocker('old', 1)],
        currentBlockers: [blocker('new', 1)],
        completedAttempts: 3,
      }).reason,
    ).toBe('no_progress');
  });

  it.each([
    ...hostileObjects(validStop).slice(0, -1),
    { ...validStop, previousBlockers: Array(1) },
    { ...validStop, currentBlockers: Array(1) },
    { ...validStop, completedAttempts: '1' },
    { ...validStop, maxAttempts: 0 },
    { ...validStop, currentBlockers: [{ ...blocker('future'), severityScore: '4' }] },
  ])('rejects hostile, sparse, or invalid stop input %# with owned error', (input) => {
    expectOwnedError(() => decideRepairStop(input));
  });

  it('validates all input before resolved decision', () => {
    expectOwnedError(() =>
      decideRepairStop({
        previousBlockers: [{ ...blocker('bad'), evidenceHash: HASH_B.toUpperCase() }],
        currentBlockers: [],
        completedAttempts: 0,
        maxAttempts: 1,
      }),
    );
  });

  it('validates safe severity sums before any decision', () => {
    expectOwnedError(() =>
      decideRepairStop({
        previousBlockers: [blocker('one', Number.MAX_SAFE_INTEGER), blocker('two', 1)],
        currentBlockers: [],
        completedAttempts: 0,
        maxAttempts: 1,
      }),
    );
  });

  it('rejects stop input accessors without invoking getters', () => {
    for (const key of Object.keys(validStop)) {
      let reads = 0;
      const input = Object.defineProperty({ ...validStop }, key, {
        get: () => {
          reads += 1;
          return validStop[key as keyof typeof validStop];
        },
        enumerable: true,
      });

      expectOwnedError(() => decideRepairStop(input));
      expect(reads).toBe(0);
    }
  });

  it('translates stop and nested proxy failures to owned errors', () => {
    expectOwnedError(() => decideRepairStop(new Proxy({ ...validStop }, { ownKeys: blocked })));
    expectOwnedError(() =>
      decideRepairStop({
        ...validStop,
        currentBlockers: new Proxy([...validStop.currentBlockers], { ownKeys: blocked }),
      }),
    );
  });
});
