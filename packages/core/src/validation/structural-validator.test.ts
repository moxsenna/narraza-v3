import { describe, expect, it } from 'vitest';
import type { ValidatorBeatContract } from '../context/packet-types.js';
import { validateBeatStructure, type StructuralEvidence } from './structural-validator.js';

const contract: ValidatorBeatContract = {
  beatId: 'beat-1',
  purpose: 'Force Mira to choose',
  requiredCharacterIds: ['mira'],
  requiredFactKeys: ['door_locked'],
  requiredDirectives: [
    { directiveKey: 'refuse', description: 'Mira refuses', lexicalEvidence: ['tidak mau'] },
  ],
  prohibitedActions: [
    { actionKey: 'leave', description: 'Mira leaves', lexicalEvidence: ['Mira pergi'] },
  ],
  endingRequirement: { description: 'End on a question', lexicalEvidence: ['?'] },
  lengthRange: { min: 10, max: 80 },
};
const evidence: StructuralEvidence = {
  characters: [{ id: 'mira', lexicalEvidence: ['Mira'] }],
  facts: [{ id: 'door_locked', lexicalEvidence: ['pintu terkunci'] }],
};

describe('validateBeatStructure', () => {
  it('emits one blocker for empty prose', () => {
    const result = validateBeatStructure({
      policyVersion: 'validator:v1',
      prose: '   ',
      contract,
      evidence,
    });
    expect(result.map((f) => [f.ruleKey, f.severity])).toEqual([['beat.prose.empty', 'blocking']]);
  });

  it('checks character, fact, directive, prohibited action, ending, and code-point length', () => {
    const result = validateBeatStructure({
      policyVersion: 'validator:v1',
      prose: 'Mira pergi tanpa menjawab.',
      contract: { ...contract, lengthRange: { min: 10, max: 20 } },
      evidence,
    });
    expect(result.map((f) => f.ruleKey)).toEqual(
      expect.arrayContaining([
        'beat.required_fact.missing',
        'beat.required_directive.missing',
        'beat.prohibited_action.present',
        'beat.ending_requirement.missing',
      ]),
    );
    expect(result.find((f) => f.ruleKey === 'beat.required_character.missing')).toBeUndefined();
    expect(result.find((f) => f.ruleKey === 'beat.length.out_of_range')?.severity).toBe('error');
  });

  it('passes lexical requirements represented on token boundaries', () => {
    const prose = 'Mira tidak mau karena pintu terkunci?';
    expect(
      validateBeatStructure({ policyVersion: 'validator:v1', prose, contract, evidence }),
    ).toEqual([]);
  });

  it('uses semantic-review warning when evidence is absent or an explicit lexical array is empty', () => {
    const { lengthRange: _ignored, ...withoutLength } = contract;
    const semantic: ValidatorBeatContract = {
      ...withoutLength,
      requiredDirectives: [
        { directiveKey: 'hesitate', description: 'Mira hesitates' },
        { directiveKey: 'distance', description: 'Mira withdraws', lexicalEvidence: [] },
      ],
      prohibitedActions: [],
      endingRequirement: { description: 'End with emotional distance', lexicalEvidence: [] },
    };
    const result = validateBeatStructure({
      policyVersion: 'validator:v1',
      prose: 'Mira tidak mau. Pintu terkunci.',
      contract: semantic,
      evidence,
    });
    expect(
      result.filter((f) => f.ruleKey.endsWith('semantic_review')).map((f) => f.severity),
    ).toEqual(['warning', 'warning', 'warning']);
    expect(result.some((f) => f.severity === 'blocking')).toBe(false);
  });

  it('emits a blocker when a catalogued required character is lexically missing', () => {
    const result = validateBeatStructure({
      policyVersion: 'validator:v1',
      prose: 'Pintu terkunci dan ia tidak mau?',
      contract,
      evidence,
    });
    expect(result.find((f) => f.ruleKey === 'beat.required_character.missing')?.severity).toBe(
      'blocking',
    );
  });

  it.each([
    null,
    [],
    new Date(),
    { policyVersion: 'validator:v1', prose: 'x', contract, evidence, unknown: true },
    { policyVersion: 'validator:v1', prose: 1, contract, evidence },
    { policyVersion: 'validator:v1', prose: 'x', contract: [], evidence },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: { ...contract, unknown: true },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: { ...contract, requiredCharacterIds: ['mira', 'mira'] },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: {
        ...contract,
        requiredCharacterIds: Object.assign(['mira'], { extra: true }),
      },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: {
        ...contract,
        requiredFactKeys: Object.assign([], { 1: 'door_locked', length: 2 }),
      },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: { ...contract, requiredDirectives: [null] },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: {
        ...contract,
        requiredDirectives: [
          { directiveKey: 'x', description: 'x', lexicalEvidence: ['ok'], unknown: true },
        ],
      },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: {
        ...contract,
        requiredDirectives: [{ directiveKey: 'x', description: 'x', lexicalEvidence: [' '] }],
      },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: { ...contract, endingRequirement: [] },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract: { ...contract, lengthRange: { min: 4, max: 3 } },
      evidence,
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract,
      evidence: { characters: [], facts: [], unknown: true },
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract,
      evidence: { characters: [1], facts: [] },
    },
    {
      policyVersion: 'validator:v1',
      prose: 'x',
      contract,
      evidence: {
        characters: [{ id: 'mira', lexicalEvidence: Object.assign([], { 1: 'Mira', length: 2 }) }],
        facts: [],
      },
    },
  ])(
    'rejects malformed unknown structural input with typed error, never TypeError: %#',
    (malformed) => {
      let thrown: unknown;
      try {
        validateBeatStructure(malformed);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'INVALID_BEAT_CONTRACT' });
      expect(thrown).not.toBeInstanceOf(TypeError);
    },
  );
});
