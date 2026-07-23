import { describe, expect, it, vi } from 'vitest';
import {
  DisclosurePolicyError,
  foldDisclosureEvents,
  type DisclosureEvent,
  type ReaderFactStatus,
} from './disclosure-policy.js';

const disclosed = (
  id: string,
  effectiveSequence: number,
  overrides: Partial<Extract<DisclosureEvent, { kind: 'disclose' }>> = {},
): Extract<DisclosureEvent, { kind: 'disclose' }> => ({
  kind: 'disclose',
  id,
  factId: 'fact-1',
  effectiveSequence,
  createdAt: '2026-07-22T09:10:11.000Z',
  status: 'known',
  ...overrides,
});

const retracted = (
  id: string,
  effectiveSequence: number,
  retractsDisclosureId: string,
  overrides: Partial<Extract<DisclosureEvent, { kind: 'retract' }>> = {},
): Extract<DisclosureEvent, { kind: 'retract' }> => ({
  kind: 'retract',
  id,
  factId: 'fact-1',
  effectiveSequence,
  createdAt: '2026-07-22T09:10:11.000Z',
  retractsDisclosureId,
  ...overrides,
});

const expectPolicyError = (
  action: () => unknown,
  code: 'INVALID_DISCLOSURE_EVENT' | 'INVALID_DISCLOSURE_RETRACTION',
) => {
  expect(action).toThrow(DisclosurePolicyError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ name: 'DisclosurePolicyError', code });
  }
};

describe('disclosure fold', () => {
  it('folds eligible events using sequence, timestamp, then ID total order', () => {
    const events = [
      disclosed('later-time', 2, { createdAt: '2026-07-22T09:10:11.002Z' }),
      disclosed('b', 2, { createdAt: '2026-07-22T09:10:11.001Z', status: 'suspected' }),
      disclosed('a', 2, { createdAt: '2026-07-22T09:10:11.001Z' }),
      disclosed('first', 1, { status: 'suspected' }),
      disclosed('future', 3),
    ];

    expect(foldDisclosureEvents(events, 'fact-1', 2)).toEqual({
      status: 'known',
      sourceDisclosureId: 'later-time',
      appliedEventIds: ['first', 'a', 'b', 'later-time'],
    });
  });

  it('parses every canonical timestamp once before numeric sorting', () => {
    const parseSpy = vi.spyOn(Date, 'parse');
    try {
      foldDisclosureEvents(
        [
          disclosed('later', 1, { createdAt: '2026-07-22T09:10:11.002Z' }),
          disclosed('earlier', 1, { createdAt: '2026-07-22T09:10:11.001Z' }),
        ],
        'fact-1',
        1,
      );
      expect(parseSpy).toHaveBeenCalledTimes(2);
    } finally {
      parseSpy.mockRestore();
    }
  });

  it.each(['suspected', 'known'] as const)('accepts disclose status %s', (status) => {
    expect(foldDisclosureEvents([disclosed('d1', 1, { status })], 'fact-1', 1)).toEqual({
      status,
      sourceDisclosureId: 'd1',
      appliedEventIds: ['d1'],
    });
  });

  it('returns unknown when no event is eligible', () => {
    expect(foldDisclosureEvents([disclosed('future', 2)], 'fact-1', 1)).toEqual({
      status: 'unknown',
      sourceDisclosureId: null,
      appliedEventIds: [],
    });
  });

  it('retracts current active disclosure for same fact', () => {
    expect(
      foldDisclosureEvents([disclosed('d1', 1), retracted('r1', 2, 'd1')], 'fact-1', 2),
    ).toEqual({
      status: 'retracted',
      sourceDisclosureId: 'd1',
      retractionId: 'r1',
      appliedEventIds: ['d1', 'r1'],
    });
  });

  it('allows a new disclosure after retraction', () => {
    expect(
      foldDisclosureEvents(
        [disclosed('d1', 1), retracted('r1', 2, 'd1'), disclosed('d2', 3, { status: 'suspected' })],
        'fact-1',
        3,
      ),
    ).toEqual({
      status: 'suspected',
      sourceDisclosureId: 'd2',
      appliedEventIds: ['d1', 'r1', 'd2'],
    });
  });

  it.each([
    [[retracted('r1', 1, 'missing')]],
    [[disclosed('d1', 1), disclosed('d2', 2), retracted('r1', 3, 'd1')]],
    [[disclosed('d1', 1), retracted('r1', 2, 'd1'), retracted('r2', 3, 'd1')]],
    [[disclosed('d1', 1), retracted('r1', 2, 'd1'), retracted('r2', 3, 'r1')]],
  ])('rejects retraction not targeting current active disclosure %#', (events) => {
    expectPolicyError(
      () => foldDisclosureEvents(events, 'fact-1', 3),
      'INVALID_DISCLOSURE_RETRACTION',
    );
  });

  it('rejects cross-fact events before applying retraction', () => {
    expectPolicyError(
      () =>
        foldDisclosureEvents(
          [disclosed('d1', 1), retracted('r1', 2, 'd1', { factId: 'fact-2' })],
          'fact-1',
          2,
        ),
      'INVALID_DISCLOSURE_EVENT',
    );
  });

  it('rejects duplicate IDs, including future events', () => {
    expectPolicyError(
      () => foldDisclosureEvents([disclosed('same', 1), disclosed('same', 99)], 'fact-1', 1),
      'INVALID_DISCLOSURE_EVENT',
    );
  });

  it.each([
    null,
    1,
    Array(1),
    Object.assign([disclosed('d1', 1)], { extra: true }),
    [null],
    [{ ...disclosed('d1', 1), extra: true }],
    [
      Object.defineProperty({ ...disclosed('d1', 1) }, 'status', {
        get: () => 'known',
        enumerable: true,
      }),
    ],
    [disclosed('d1', 1), { ...disclosed('future', 99), createdAt: 'bad' }],
    [{ ...disclosed('future', 99), status: 3 }],
  ])('rejects hostile or invalid future events %#', (events) => {
    expectPolicyError(() => foldDisclosureEvents(events, 'fact-1', 1), 'INVALID_DISCLOSURE_EVENT');
  });

  it.each([
    [{ ...disclosed('d1', 1), kind: 'other' }],
    [{ ...disclosed('d1', 1), effectiveSequence: '1' }],
    [{ ...disclosed('d1', 1), id: '' }],
    [{ ...disclosed('d1', 1), factId: '' }],
    [{ ...retracted('r1', 1, 'd1'), retractsDisclosureId: '' }],
    [
      Object.defineProperty({ ...disclosed('d1', 1) }, 'kind', {
        get: () => 'disclose',
        enumerable: true,
      }),
    ],
  ])('rejects malformed exact discriminated event %#', (events) => {
    expectPolicyError(() => foldDisclosureEvents(events, 'fact-1', 1), 'INVALID_DISCLOSURE_EVENT');
  });

  it.each([
    [[], null, 1],
    [[], '', 1],
    [[], 'fact-1', '1'],
    [[], 'fact-1', -1],
  ])('rejects malformed scalar arguments %#', (args) => {
    expectPolicyError(
      () => foldDisclosureEvents(...(args as [unknown, unknown, unknown])),
      'INVALID_DISCLOSURE_EVENT',
    );
  });

  it('returns frozen defensive output without mutating input', () => {
    const events = [disclosed('d1', 1), retracted('r1', 2, 'd1')];
    const snapshot = structuredClone(events);
    const result = foldDisclosureEvents(events, 'fact-1', 2);

    expect(events).toEqual(snapshot);
    expect(result.appliedEventIds).not.toBe(events);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.appliedEventIds)).toBe(true);
  });

  it('exposes closed reader fact status type', () => {
    const statuses: readonly ReaderFactStatus[] = ['unknown', 'suspected', 'known', 'retracted'];
    expect(statuses).toHaveLength(4);
  });
});
