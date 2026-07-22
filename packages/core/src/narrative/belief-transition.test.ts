import { describe, expect, it } from 'vitest';
import { parseCanonicalTimestamp } from './canonical-timestamp.js';
import {
  BeliefPolicyError,
  foldBeliefEvents,
  type BeliefDowngradeReason,
  type BeliefEvent,
  type BeliefLevel,
} from './knowledge-policy.js';

const event = (overrides: Partial<BeliefEvent> = {}): BeliefEvent => ({
  id: 'event-1',
  effectiveSequence: 1,
  createdAt: '2026-07-22T09:10:11.000Z',
  level: 'suspected',
  ...overrides,
});

const expectPolicyError = (
  action: () => unknown,
  code: 'INVALID_BELIEF_EVENT' | 'INVALID_BELIEF_TRANSITION',
) => {
  expect(action).toThrow(BeliefPolicyError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ name: 'BeliefPolicyError', code });
  }
};

describe('canonical timestamp', () => {
  it.each([
    '2026-07-22T09:10:11Z',
    '2026-07-22T09:10:11.00Z',
    '2026-07-22T09:10:11.000+00:00',
    '2026-7-22T09:10:11.000Z',
    '2026-02-29T09:10:11.000Z',
    '2026-07-22T24:00:00.000Z',
  ])('rejects non-canonical timestamp %s', (value) => {
    expect(parseCanonicalTimestamp(value)).toBeNull();
  });

  it('parses exact UTC millisecond timestamp', () => {
    expect(parseCanonicalTimestamp('2026-07-22T09:10:11.007Z')).toBe(
      Date.UTC(2026, 6, 22, 9, 10, 11, 7),
    );
  });
});

describe('belief transition policy', () => {
  it('folds eligible events using sequence, createdAt, then ID total order', () => {
    const events = [
      event({ id: 'z', effectiveSequence: 2, createdAt: '2026-07-22T09:10:11.002Z' }),
      event({ id: 'b', effectiveSequence: 2, createdAt: '2026-07-22T09:10:11.001Z' }),
      event({ id: 'a', effectiveSequence: 2, createdAt: '2026-07-22T09:10:11.001Z' }),
      event({ id: 'first', level: 'unknown' }),
      event({ id: 'future', effectiveSequence: 3, level: 'known' }),
    ];

    expect(foldBeliefEvents(events, 2)).toEqual({
      level: 'suspected',
      sourceEventId: 'z',
      appliedEventIds: ['first', 'a', 'b', 'z'],
    });
  });

  it('returns unknown with no source when no event is eligible', () => {
    expect(foldBeliefEvents([event({ effectiveSequence: 2 })], 1)).toEqual({
      level: 'unknown',
      sourceEventId: null,
      appliedEventIds: [],
    });
  });

  it.each([
    ['suspected', 'unknown'],
    ['believed', 'suspected'],
    ['known', 'believed'],
  ] as const)('requires reason for downgrade from %s to %s', (from, to) => {
    expectPolicyError(
      () =>
        foldBeliefEvents(
          [
            event({ id: 'from', level: from }),
            event({ id: 'to', effectiveSequence: 2, level: to }),
          ],
          2,
        ),
      'INVALID_BELIEF_TRANSITION',
    );
  });

  it.each([
    'new_evidence',
    'source_discredited',
    'memory_loss',
    'deliberate_deception',
    'canon_correction',
  ] as const)('allows downgrade reason %s', (downgradeReason) => {
    expect(
      foldBeliefEvents(
        [
          event({ id: 'known', level: 'known' }),
          event({ id: 'lower', effectiveSequence: 2, level: 'believed', downgradeReason }),
        ],
        2,
      ).level,
    ).toBe('believed');
  });

  it.each([
    ['known', 'disproven'],
    ['disproven', 'known'],
    ['unknown', 'disproven'],
    ['disproven', 'unknown'],
  ] as const)('requires reason for transition from %s to %s', (from, to) => {
    expectPolicyError(
      () =>
        foldBeliefEvents(
          [
            event({ id: 'from', level: from }),
            event({ id: 'to', effectiveSequence: 2, level: to }),
          ],
          2,
        ),
      'INVALID_BELIEF_TRANSITION',
    );
  });

  it('allows transition into and out of disproven with a reason', () => {
    expect(
      foldBeliefEvents(
        [
          event({ id: 'known', level: 'known' }),
          event({
            id: 'disproven',
            effectiveSequence: 2,
            level: 'disproven',
            downgradeReason: 'new_evidence',
          }),
          event({
            id: 'restored',
            effectiveSequence: 3,
            level: 'believed',
            downgradeReason: 'canon_correction',
          }),
        ],
        3,
      ),
    ).toMatchObject({ level: 'believed', sourceEventId: 'restored' });
  });

  it('does not require a reason when level stays unchanged', () => {
    expect(
      foldBeliefEvents([event({ id: 'first' }), event({ id: 'repeat', effectiveSequence: 2 })], 2),
    ).toMatchObject({ level: 'suspected', sourceEventId: 'repeat' });
  });

  it('rejects duplicate IDs, including future events', () => {
    expectPolicyError(
      () => foldBeliefEvents([event(), event({ effectiveSequence: 99, level: 'known' })], 1),
      'INVALID_BELIEF_EVENT',
    );
  });

  it.each([
    null,
    1,
    Array(1),
    Object.assign([event()], { extra: true }),
    [null],
    [{ ...event(), extra: true }],
    [{ ...event(), effectiveSequence: '9' }],
    [
      event(),
      { ...event({ id: 'future', effectiveSequence: 99 }), createdAt: '2026-07-22T09:10:11Z' },
    ],
  ])('belief boundary rejects %# with owned error', (events) => {
    expectPolicyError(() => foldBeliefEvents(events, 1), 'INVALID_BELIEF_EVENT');
  });

  it.each([null, '1', -1, 1.5])('rejects target %#', (target) => {
    expectPolicyError(() => foldBeliefEvents([], target), 'INVALID_BELIEF_EVENT');
  });

  it.each([
    { field: 'id', value: '' },
    { field: 'effectiveSequence', value: Number.MAX_SAFE_INTEGER + 1 },
    { field: 'createdAt', value: 'not-a-date' },
    { field: 'level', value: 'certain' },
    { field: 'downgradeReason', value: 'because' },
  ])('rejects invalid event $field', ({ field, value }) => {
    expectPolicyError(
      () => foldBeliefEvents([{ ...event(), [field]: value }], 1),
      'INVALID_BELIEF_EVENT',
    );
  });

  it.each([
    Object.create(null),
    new Proxy(event(), {
      ownKeys: () => {
        throw new Error('hostile');
      },
    }),
  ])('fails closed at runtime boundary for %#', (value) => {
    expectPolicyError(() => foldBeliefEvents([value], 1), 'INVALID_BELIEF_EVENT');
  });

  it('accepts frozen exact events', () => {
    expect(foldBeliefEvents([Object.freeze({ ...event() })], 1).level).toBe('suspected');
  });

  it('returns defensive readonly output without mutating input', () => {
    const events = [event()];
    const result = foldBeliefEvents(events, 1);

    expect(result.appliedEventIds).not.toBe(events);
    expect(events).toEqual([event()]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.appliedEventIds)).toBe(true);
  });

  it('exposes closed belief level and reason types', () => {
    const level: BeliefLevel = 'known';
    const reason: BeliefDowngradeReason = 'new_evidence';
    expect([level, reason]).toEqual(['known', 'new_evidence']);
  });
});
