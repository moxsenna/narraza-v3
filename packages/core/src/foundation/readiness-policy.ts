import {
  booleanValue,
  denseArray,
  exactObject,
  nonEmptyString,
  nullableString,
  type Fail,
} from '../validation/exact.js';
import {
  compareNarrativePositions,
  createNarrativePosition,
  NarrativePositionError,
  narrativePositionsEqual,
  type NarrativePosition,
} from '../narrative/position.js';

export type ReadinessKey =
  | 'core_concept'
  | 'main_character'
  | 'main_relationship'
  | 'conflict'
  | 'ending_direction'
  | 'reader_promise'
  | 'character_address'
  | 'speech_style'
  | 'secret_schedule';

export interface FoundationMainCharacter {
  readonly id: string;
  readonly active: boolean;
  readonly identity: string | null;
  readonly goal: string | null;
  readonly motivation: string | null;
  readonly address: string | null;
  readonly speechStyle: string | null;
}

export interface FoundationRelationship {
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly active: boolean;
  readonly description: string | null;
}

export interface FoundationSecretSchedule {
  readonly truth: string | null;
  readonly targetPosition: NarrativePosition | null;
  readonly breadcrumbPositions: readonly NarrativePosition[];
}

export interface FoundationReadinessInput {
  readonly coreConcept: string | null;
  readonly mainCharacter: FoundationMainCharacter | null;
  readonly relationships: readonly FoundationRelationship[];
  readonly conflict: string | null;
  readonly endingDirection: string | null;
  readonly readerPromise: string | null;
  readonly secrets: readonly FoundationSecretSchedule[];
}

export interface ReadinessChecklistItem {
  readonly key: ReadinessKey;
  readonly weight: number;
  readonly earned: number;
  readonly complete: boolean;
}

export interface ReadinessResult {
  readonly percent: number;
  readonly checklist: readonly ReadinessChecklistItem[];
  readonly nextRecommendation: ReadinessKey | null;
}

export class FoundationReadinessError extends Error {
  readonly code = 'INVALID_FOUNDATION_READINESS_INPUT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'FoundationReadinessError';
  }
}

const fail: Fail = (message) => {
  throw new FoundationReadinessError(message);
};

const ROOT_KEYS = [
  'coreConcept',
  'mainCharacter',
  'relationships',
  'conflict',
  'endingDirection',
  'readerPromise',
  'secrets',
] as const;

const MAIN_CHARACTER_KEYS = [
  'id',
  'active',
  'identity',
  'goal',
  'motivation',
  'address',
  'speechStyle',
] as const;

const RELATIONSHIP_KEYS = ['fromCharacterId', 'toCharacterId', 'active', 'description'] as const;

const SECRET_KEYS = ['truth', 'targetPosition', 'breadcrumbPositions'] as const;

const WEIGHTS: Readonly<Record<ReadinessKey, number>> = Object.freeze({
  core_concept: 20,
  main_character: 15,
  main_relationship: 10,
  conflict: 15,
  ending_direction: 10,
  reader_promise: 10,
  character_address: 5,
  speech_style: 5,
  secret_schedule: 10,
});

const READINESS_ORDER = Object.freeze<readonly ReadinessKey[]>([
  'core_concept',
  'main_character',
  'main_relationship',
  'conflict',
  'ending_direction',
  'reader_promise',
  'character_address',
  'speech_style',
  'secret_schedule',
]);

function parseOwnedPosition(input: unknown, label: string): NarrativePosition {
  try {
    return createNarrativePosition(input);
  } catch (error) {
    if (error instanceof NarrativePositionError) return fail(`${label} is invalid`);
    return fail(`${label} reflection failed`);
  }
}

function parseMainCharacter(input: unknown): FoundationMainCharacter | null {
  if (input === null) return null;
  const value = exactObject(input, MAIN_CHARACTER_KEYS, fail, 'mainCharacter');
  return {
    id: nonEmptyString(value.id, fail, 'mainCharacter.id'),
    active: booleanValue(value.active, fail, 'mainCharacter.active'),
    identity: nullableString(value.identity, fail, 'mainCharacter.identity'),
    goal: nullableString(value.goal, fail, 'mainCharacter.goal'),
    motivation: nullableString(value.motivation, fail, 'mainCharacter.motivation'),
    address: nullableString(value.address, fail, 'mainCharacter.address'),
    speechStyle: nullableString(value.speechStyle, fail, 'mainCharacter.speechStyle'),
  };
}

function parseRelationships(input: unknown): readonly FoundationRelationship[] {
  return denseArray(input, fail, 'relationships').map((raw, index) => {
    const label = `relationships[${index}]`;
    const value = exactObject(raw, RELATIONSHIP_KEYS, fail, label);
    return {
      fromCharacterId: nonEmptyString(value.fromCharacterId, fail, `${label}.fromCharacterId`),
      toCharacterId: nonEmptyString(value.toCharacterId, fail, `${label}.toCharacterId`),
      active: booleanValue(value.active, fail, `${label}.active`),
      description: nullableString(value.description, fail, `${label}.description`),
    };
  });
}

function parseSecrets(input: unknown): readonly FoundationSecretSchedule[] {
  return denseArray(input, fail, 'secrets').map((raw, index) => {
    const label = `secrets[${index}]`;
    const value = exactObject(raw, SECRET_KEYS, fail, label);
    const targetPosition =
      value.targetPosition === null
        ? null
        : parseOwnedPosition(value.targetPosition, `${label}.targetPosition`);
    const breadcrumbPositions = denseArray(
      value.breadcrumbPositions,
      fail,
      `${label}.breadcrumbPositions`,
    ).map((position, breadcrumbIndex) =>
      parseOwnedPosition(position, `${label}.breadcrumbPositions[${breadcrumbIndex}]`),
    );
    return {
      truth: nullableString(value.truth, fail, `${label}.truth`),
      targetPosition,
      breadcrumbPositions,
    };
  });
}

function parseReadiness(input: unknown): FoundationReadinessInput {
  try {
    const root = exactObject(input, ROOT_KEYS, fail, 'readiness input');
    return {
      coreConcept: nullableString(root.coreConcept, fail, 'coreConcept'),
      mainCharacter: parseMainCharacter(root.mainCharacter),
      relationships: parseRelationships(root.relationships),
      conflict: nullableString(root.conflict, fail, 'conflict'),
      endingDirection: nullableString(root.endingDirection, fail, 'endingDirection'),
      readerPromise: nullableString(root.readerPromise, fail, 'readerPromise'),
      secrets: parseSecrets(root.secrets),
    };
  } catch (error) {
    if (error instanceof FoundationReadinessError) throw error;
    return fail('readiness reflection failed');
  }
}

const present = (value: string | null): boolean =>
  value !== null && Array.from(value.trim()).length >= 1;

function validBreadcrumbSchedule(secret: FoundationSecretSchedule): boolean {
  const target = secret.targetPosition;
  const breadcrumbs = secret.breadcrumbPositions;
  if (target === null || breadcrumbs.length === 0) return false;
  for (let index = 0; index < breadcrumbs.length; index += 1) {
    const breadcrumb = breadcrumbs[index]!;
    if (compareNarrativePositions(breadcrumb, target) >= 0) return false;
    if (
      breadcrumbs.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index && narrativePositionsEqual(candidate, breadcrumb),
      )
    ) {
      return false;
    }
  }
  return true;
}

function secretScore(secret: FoundationSecretSchedule): number {
  return (
    (present(secret.truth) ? 4 : 0) +
    (secret.targetPosition === null ? 0 : 3) +
    (validBreadcrumbSchedule(secret) ? 3 : 0)
  );
}

function calculateTyped(input: FoundationReadinessInput): ReadinessResult {
  const main = input.mainCharacter?.active === true ? input.mainCharacter : null;
  const mainCharacterScore =
    (present(main?.identity ?? null) ? 5 : 0) +
    (present(main?.goal ?? null) ? 5 : 0) +
    (present(main?.motivation ?? null) ? 5 : 0);
  const relationshipComplete =
    main !== null &&
    input.relationships.some(
      (relationship) =>
        relationship.active &&
        present(relationship.description) &&
        relationship.fromCharacterId !== relationship.toCharacterId &&
        (relationship.fromCharacterId === main.id || relationship.toCharacterId === main.id),
    );
  const secretScheduleScore = input.secrets.reduce(
    (highest, secret) => Math.max(highest, secretScore(secret)),
    0,
  );
  const earned: Readonly<Record<ReadinessKey, number>> = {
    core_concept: present(input.coreConcept) ? 20 : 0,
    main_character: mainCharacterScore,
    main_relationship: relationshipComplete ? 10 : 0,
    conflict: present(input.conflict) ? 15 : 0,
    ending_direction: present(input.endingDirection) ? 10 : 0,
    reader_promise: present(input.readerPromise) ? 10 : 0,
    character_address: present(main?.address ?? null) ? 5 : 0,
    speech_style: present(main?.speechStyle ?? null) ? 5 : 0,
    secret_schedule: secretScheduleScore,
  };
  const checklist = Object.freeze(
    READINESS_ORDER.map((key) =>
      Object.freeze({
        key,
        weight: WEIGHTS[key],
        earned: earned[key],
        complete: earned[key] === WEIGHTS[key],
      }),
    ),
  );
  const percent = checklist.reduce((total, item) => total + item.earned, 0);
  let nextRecommendation: ReadinessKey | null = null;
  let largestRemaining = 0;
  for (const item of checklist) {
    const remaining = item.weight - item.earned;
    if (remaining > largestRemaining) {
      largestRemaining = remaining;
      nextRecommendation = item.key;
    }
  }
  return Object.freeze({ percent, checklist, nextRecommendation });
}

export function calculateFoundationReadiness(input: unknown): ReadinessResult {
  return calculateTyped(parseReadiness(input));
}
