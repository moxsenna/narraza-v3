import { describe, expect, it } from 'vitest';
import { hostileObjects } from '../validation/hostile-fixtures.test.js';
import {
  calculateFoundationReadiness,
  FoundationReadinessError,
  type FoundationReadinessInput,
  type ReadinessKey,
} from './readiness-policy.js';

const position = (sequence: number, chapterId = `chapter-${sequence}`) => ({
  chapterId,
  sequence,
});

const blank = (): FoundationReadinessInput => ({
  coreConcept: null,
  mainCharacter: null,
  relationships: [],
  conflict: null,
  endingDirection: null,
  readerPromise: null,
  secrets: [],
});

const complete = (): FoundationReadinessInput => ({
  coreConcept: 'A promise carries a hidden cost.',
  mainCharacter: {
    id: 'main',
    active: true,
    identity: 'An idealistic courier',
    goal: 'Deliver the final letter',
    motivation: 'Protect her sister',
    address: 'Mira',
    speechStyle: 'Brief and formal',
  },
  relationships: [
    {
      fromCharacterId: 'other',
      toCharacterId: 'main',
      active: true,
      description: 'Former allies forced to cooperate',
    },
  ],
  conflict: 'The recipient wants the letter destroyed.',
  endingDirection: 'Mira reveals the cost and chooses exile.',
  readerPromise: 'A tense moral mystery with earned answers.',
  secrets: [
    {
      truth: 'Mira wrote the letter herself.',
      targetPosition: position(8),
      breadcrumbPositions: [position(2), position(5)],
    },
  ],
});

const keys: readonly ReadinessKey[] = [
  'core_concept',
  'main_character',
  'main_relationship',
  'conflict',
  'ending_direction',
  'reader_promise',
  'character_address',
  'speech_style',
  'secret_schedule',
];

const expectInputError = (input: unknown) => {
  const action = () => calculateFoundationReadiness(input);
  expect(action).toThrow(FoundationReadinessError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({
      name: 'FoundationReadinessError',
      code: 'INVALID_FOUNDATION_READINESS_INPUT',
    });
  }
};

describe('foundation readiness', () => {
  it('scores complete foundation at 100 in stable checklist order', () => {
    const result = calculateFoundationReadiness(complete());

    expect(result).toEqual({
      percent: 100,
      checklist: [
        { key: 'core_concept', weight: 20, earned: 20, complete: true },
        { key: 'main_character', weight: 15, earned: 15, complete: true },
        { key: 'main_relationship', weight: 10, earned: 10, complete: true },
        { key: 'conflict', weight: 15, earned: 15, complete: true },
        { key: 'ending_direction', weight: 10, earned: 10, complete: true },
        { key: 'reader_promise', weight: 10, earned: 10, complete: true },
        { key: 'character_address', weight: 5, earned: 5, complete: true },
        { key: 'speech_style', weight: 5, earned: 5, complete: true },
        { key: 'secret_schedule', weight: 10, earned: 10, complete: true },
      ],
      nextRecommendation: null,
    });
    expect(result.checklist.map((item) => item.key)).toEqual(keys);
  });

  it('uses fixed partial points for active resolved main character fields', () => {
    const input = blank();
    input.mainCharacter = {
      id: 'main',
      active: true,
      identity: '  Hero  ',
      goal: '\t',
      motivation: 'Motivation',
      address: 'Name',
      speechStyle: 'Direct',
    };

    const result = calculateFoundationReadiness(input);

    expect(result.percent).toBe(20);
    expect(result.checklist.find((item) => item.key === 'main_character')).toEqual({
      key: 'main_character',
      weight: 15,
      earned: 10,
      complete: false,
    });
    expect(result.checklist.find((item) => item.key === 'character_address')?.earned).toBe(5);
    expect(result.checklist.find((item) => item.key === 'speech_style')?.earned).toBe(5);
  });

  it.each([
    { active: false, id: 'main' },
    { active: true, id: 'main' },
  ])('requires active main before scoring its fields: %o', ({ active, id }) => {
    const input = blank();
    input.mainCharacter = {
      id,
      active,
      identity: 'Identity',
      goal: 'Goal',
      motivation: 'Motivation',
      address: 'Address',
      speechStyle: 'Style',
    };
    if (active) input.mainCharacter = null;

    expect(calculateFoundationReadiness(input).percent).toBe(0);
  });

  it('accepts presence when trim leaves at least one Unicode code point', () => {
    const input = blank();
    input.coreConcept = '  𐐷  ';
    input.conflict = '\u2003';

    const result = calculateFoundationReadiness(input);

    expect(result.checklist.find((item) => item.key === 'core_concept')?.earned).toBe(20);
    expect(result.checklist.find((item) => item.key === 'conflict')?.earned).toBe(0);
  });

  it.each([
    {
      fromCharacterId: 'main',
      toCharacterId: 'other',
      active: true,
      description: 'Rivals',
    },
    {
      fromCharacterId: 'other',
      toCharacterId: 'main',
      active: true,
      description: 'Rivals',
    },
  ])('scores active described main-to-other relationship: %o', (relationship) => {
    const input = blank();
    input.mainCharacter = {
      id: 'main',
      active: true,
      identity: null,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
    };
    input.relationships = [relationship];

    expect(calculateFoundationReadiness(input).percent).toBe(10);
  });

  it.each([
    { fromCharacterId: 'main', toCharacterId: 'main', active: true, description: 'Self' },
    { fromCharacterId: 'main', toCharacterId: 'other', active: false, description: 'Rivals' },
    { fromCharacterId: 'main', toCharacterId: 'other', active: true, description: '  ' },
    { fromCharacterId: 'one', toCharacterId: 'other', active: true, description: 'Rivals' },
  ])('does not score ineligible relationship: %o', (relationship) => {
    const input = blank();
    input.mainCharacter = {
      id: 'main',
      active: true,
      identity: null,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
    };
    input.relationships = [relationship];

    expect(calculateFoundationReadiness(input).percent).toBe(0);
  });

  it('scores secret truth, target, and valid breadcrumb independently', () => {
    const input = blank();
    input.secrets = [
      {
        truth: 'Secret',
        targetPosition: position(5),
        breadcrumbPositions: [position(2)],
      },
    ];

    expect(calculateFoundationReadiness(input).checklist.at(-1)).toEqual({
      key: 'secret_schedule',
      weight: 10,
      earned: 10,
      complete: true,
    });
  });

  it.each([
    [null, null, [], 0],
    ['Secret', null, [], 4],
    [null, position(5), [], 3],
    ['Secret', position(5), [], 7],
    ['Secret', position(5), [position(2), position(2)], 7],
    ['Secret', position(5), [position(5)], 7],
    ['Secret', position(5), [position(6)], 7],
  ] as const)(
    'scores valid secret components without breadcrumb points for duplicate or at/after target %#',
    (truth, targetPosition, breadcrumbPositions, earned) => {
      const input = blank();
      input.secrets = [{ truth, targetPosition, breadcrumbPositions }];

      expect(
        calculateFoundationReadiness(input).checklist.find((item) => item.key === 'secret_schedule')
          ?.earned,
      ).toBe(earned);
    },
  );

  it('uses one secret schedule candidate instead of combining partial secrets', () => {
    const input = blank();
    input.secrets = [
      { truth: 'Secret', targetPosition: null, breadcrumbPositions: [] },
      { truth: null, targetPosition: position(5), breadcrumbPositions: [position(2)] },
    ];

    expect(
      calculateFoundationReadiness(input).checklist.find((item) => item.key === 'secret_schedule')
        ?.earned,
    ).toBe(6);
  });

  it('recommends largest remaining weight and breaks ties by table order', () => {
    expect(calculateFoundationReadiness(blank()).nextRecommendation).toBe('core_concept');

    const input = blank();
    input.coreConcept = 'Concept';
    input.conflict = 'Conflict';
    expect(calculateFoundationReadiness(input).nextRecommendation).toBe('main_character');

    input.mainCharacter = {
      id: 'main',
      active: true,
      identity: 'Identity',
      goal: 'Goal',
      motivation: null,
      address: null,
      speechStyle: null,
    };
    expect(calculateFoundationReadiness(input).nextRecommendation).toBe('main_relationship');
  });

  it.each([
    ...hostileObjects(blank()).slice(0, -1),
    { ...blank(), relationships: Array(1) },
    {
      ...blank(),
      relationships: [
        {
          fromCharacterId: 'a',
          toCharacterId: 'b',
          active: true,
          description: null,
          extra: 1,
        },
      ],
    },
    {
      ...blank(),
      mainCharacter: {
        id: 'm',
        active: 'yes',
        identity: null,
        goal: null,
        motivation: null,
        address: null,
        speechStyle: null,
      },
    },
    {
      ...blank(),
      secrets: [
        {
          truth: 'x',
          targetPosition: { chapterId: 'c', sequence: 'future' },
          breadcrumbPositions: [],
        },
      ],
    },
    {
      ...blank(),
      secrets: [{ truth: 'x', targetPosition: null, breadcrumbPositions: [null] }],
    },
    {
      ...blank(),
      secrets: [{ truth: 'x', targetPosition: null, breadcrumbPositions: Array(1) }],
    },
  ])('rejects hostile snapshot %# with owned exact error', (input) => {
    expectInputError(input);
  });

  it('rejects malformed values even when they cannot contribute points', () => {
    const input = blank() as unknown as Record<string, unknown>;
    input.mainCharacter = {
      id: 'main',
      active: false,
      identity: 1,
      goal: null,
      motivation: null,
      address: null,
      speechStyle: null,
    };
    input.relationships = [
      { fromCharacterId: 'a', toCharacterId: 'b', active: false, description: 1 },
    ];
    input.secrets = [
      {
        truth: null,
        targetPosition: null,
        breadcrumbPositions: [{ chapterId: 'x', sequence: -1 }],
      },
    ];

    expectInputError(input);
  });

  it('returns deeply frozen defensive output without mutating input', () => {
    const input = complete();
    const snapshot = structuredClone(input);
    const result = calculateFoundationReadiness(input);

    expect(input).toEqual(snapshot);
    expect(result.checklist).not.toBe(input.relationships);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checklist)).toBe(true);
    expect(result.checklist.every(Object.isFrozen)).toBe(true);
  });
});
