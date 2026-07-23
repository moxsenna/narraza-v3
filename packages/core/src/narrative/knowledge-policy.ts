import {
  denseArray,
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';
import { parseCanonicalTimestamp } from './canonical-timestamp.js';

export type BeliefLevel = 'unknown' | 'suspected' | 'believed' | 'known' | 'disproven';
export type BeliefDowngradeReason =
  | 'new_evidence'
  | 'source_discredited'
  | 'memory_loss'
  | 'deliberate_deception'
  | 'canon_correction';
export interface BeliefEvent {
  readonly id: string;
  readonly effectiveSequence: number;
  readonly createdAt: string;
  readonly level: BeliefLevel;
  readonly downgradeReason?: BeliefDowngradeReason;
}
export interface BeliefFoldResult {
  readonly level: BeliefLevel;
  readonly sourceEventId: string | null;
  readonly appliedEventIds: readonly string[];
}
type ParsedBeliefEvent = BeliefEvent & {
  readonly epochMilliseconds: number;
};
export type BeliefPolicyErrorCode = 'INVALID_BELIEF_EVENT' | 'INVALID_BELIEF_TRANSITION';
export class BeliefPolicyError extends Error {
  constructor(
    readonly code: BeliefPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BeliefPolicyError';
  }
}

const levels = new Set<BeliefLevel>(['unknown', 'suspected', 'believed', 'known', 'disproven']);
const reasons = new Set<BeliefDowngradeReason>([
  'new_evidence',
  'source_discredited',
  'memory_loss',
  'deliberate_deception',
  'canon_correction',
]);
const rank = { unknown: 0, suspected: 1, believed: 2, known: 3 } as const;
const fail: Fail = (message) => {
  throw new BeliefPolicyError('INVALID_BELIEF_EVENT', message);
};

function parseEvent(raw: unknown, index: number): ParsedBeliefEvent {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(`events[${index}] invalid`);
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(raw);
  } catch {
    return fail(`events[${index}] reflection failed`);
  }
  const hasReason = keys.includes('downgradeReason');
  const expected = hasReason
    ? ['id', 'effectiveSequence', 'createdAt', 'level', 'downgradeReason']
    : ['id', 'effectiveSequence', 'createdAt', 'level'];
  const item = exactObject(raw, expected, fail, `events[${index}]`);
  const createdAt = nonEmptyString(item.createdAt, fail, `events[${index}].createdAt`);
  const epochMilliseconds = parseCanonicalTimestamp(createdAt);
  if (epochMilliseconds === null) {
    return fail('createdAt must be canonical UTC milliseconds');
  }
  if (!levels.has(item.level as BeliefLevel)) return fail('invalid belief level');
  if (hasReason && !reasons.has(item.downgradeReason as BeliefDowngradeReason)) {
    return fail('invalid downgrade reason');
  }
  return {
    id: nonEmptyString(item.id, fail, `events[${index}].id`),
    effectiveSequence: nonNegativeSafeInteger(
      item.effectiveSequence,
      fail,
      `events[${index}].effectiveSequence`,
    ),
    createdAt,
    epochMilliseconds,
    level: item.level as BeliefLevel,
    ...(hasReason ? { downgradeReason: item.downgradeReason as BeliefDowngradeReason } : {}),
  };
}

function compareEvents(left: ParsedBeliefEvent, right: ParsedBeliefEvent): number {
  return (
    left.effectiveSequence - right.effectiveSequence ||
    left.epochMilliseconds - right.epochMilliseconds ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function requiresReason(from: BeliefLevel, to: BeliefLevel): boolean {
  if (from === to) return false;
  if (from === 'disproven' || to === 'disproven') return true;
  return rank[to] < rank[from];
}

function foldTyped(events: readonly ParsedBeliefEvent[], targetSequence: number): BeliefFoldResult {
  const ordered = events
    .filter((item) => item.effectiveSequence <= targetSequence)
    .sort(compareEvents);
  let level: BeliefLevel = 'unknown';
  const appliedEventIds: string[] = [];
  for (const item of ordered) {
    if (requiresReason(level, item.level) && item.downgradeReason === undefined) {
      throw new BeliefPolicyError(
        'INVALID_BELIEF_TRANSITION',
        `${level} to ${item.level} requires reason`,
      );
    }
    level = item.level;
    appliedEventIds.push(item.id);
  }
  const readonlyIds = Object.freeze([...appliedEventIds]);
  return Object.freeze({
    level,
    sourceEventId: readonlyIds.at(-1) ?? null,
    appliedEventIds: readonlyIds,
  });
}

export function foldBeliefEvents(
  eventsInput: unknown,
  targetSequenceInput: unknown,
): BeliefFoldResult {
  try {
    const targetSequence = nonNegativeSafeInteger(targetSequenceInput, fail, 'targetSequence');
    const ids = new Set<string>();
    const events = denseArray(eventsInput, fail, 'events').map(parseEvent);
    for (const item of events) {
      if (ids.has(item.id)) return fail('duplicate event ID');
      ids.add(item.id);
    }
    return foldTyped(events, targetSequence);
  } catch (error) {
    if (error instanceof BeliefPolicyError) throw error;
    return fail('belief input reflection failed');
  }
}
