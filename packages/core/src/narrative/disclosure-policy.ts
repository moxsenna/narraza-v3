import {
  denseArray,
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';
import { parseCanonicalTimestamp } from './canonical-timestamp.js';

export type ReaderFactStatus = 'unknown' | 'suspected' | 'known' | 'retracted';

type BaseDisclosureEvent = {
  readonly id: string;
  readonly factId: string;
  readonly effectiveSequence: number;
  readonly createdAt: string;
};

export type DisclosureEvent =
  | (BaseDisclosureEvent & {
      readonly kind: 'disclose';
      readonly status: 'suspected' | 'known';
    })
  | (BaseDisclosureEvent & {
      readonly kind: 'retract';
      readonly retractsDisclosureId: string;
    });

export type ReaderFactState =
  | {
      readonly status: 'unknown';
      readonly sourceDisclosureId: null;
      readonly appliedEventIds: readonly string[];
    }
  | {
      readonly status: 'suspected' | 'known';
      readonly sourceDisclosureId: string;
      readonly appliedEventIds: readonly string[];
    }
  | {
      readonly status: 'retracted';
      readonly sourceDisclosureId: string;
      readonly retractionId: string;
      readonly appliedEventIds: readonly string[];
    };

type ParsedDisclosureEvent = DisclosureEvent & {
  readonly epochMilliseconds: number;
};

export type DisclosureErrorCode = 'INVALID_DISCLOSURE_EVENT' | 'INVALID_DISCLOSURE_RETRACTION';

export class DisclosurePolicyError extends Error {
  constructor(
    readonly code: DisclosureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DisclosurePolicyError';
  }
}

const fail: Fail = (message) => {
  throw new DisclosurePolicyError('INVALID_DISCLOSURE_EVENT', message);
};

function eventKeys(raw: unknown, index: number): readonly string[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail(`events[${index}] must be object`);
  }
  try {
    Reflect.ownKeys(raw);
  } catch {
    return fail(`events[${index}] reflection failed`);
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(raw, 'kind');
  } catch {
    return fail(`events[${index}].kind reflection failed`);
  }
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    return fail(`events[${index}].kind must be an enumerable data property`);
  }
  if (descriptor.value === 'disclose') {
    return ['kind', 'id', 'factId', 'effectiveSequence', 'createdAt', 'status'];
  }
  if (descriptor.value === 'retract') {
    return ['kind', 'id', 'factId', 'effectiveSequence', 'createdAt', 'retractsDisclosureId'];
  }
  return fail('unsupported disclosure kind');
}

function parseDisclosure(raw: unknown, index: number, factId: string): ParsedDisclosureEvent {
  const item = exactObject(raw, eventKeys(raw, index), fail, `events[${index}]`);
  const id = nonEmptyString(item.id, fail, `events[${index}].id`);
  const eventFactId = nonEmptyString(item.factId, fail, `events[${index}].factId`);
  if (eventFactId !== factId) return fail('event fact mismatch');
  const effectiveSequence = nonNegativeSafeInteger(
    item.effectiveSequence,
    fail,
    `events[${index}].effectiveSequence`,
  );
  const createdAt = nonEmptyString(item.createdAt, fail, `events[${index}].createdAt`);
  const epochMilliseconds = parseCanonicalTimestamp(createdAt);
  if (epochMilliseconds === null) return fail('createdAt must be canonical UTC milliseconds');

  if (item.kind === 'disclose') {
    if (item.status !== 'suspected' && item.status !== 'known') return fail('status invalid');
    return {
      kind: 'disclose',
      id,
      factId: eventFactId,
      effectiveSequence,
      createdAt,
      epochMilliseconds,
      status: item.status,
    };
  }

  return {
    kind: 'retract',
    id,
    factId: eventFactId,
    effectiveSequence,
    createdAt,
    epochMilliseconds,
    retractsDisclosureId: nonEmptyString(
      item.retractsDisclosureId,
      fail,
      `events[${index}].retractsDisclosureId`,
    ),
  };
}

function compareEvents(left: ParsedDisclosureEvent, right: ParsedDisclosureEvent): number {
  return (
    left.effectiveSequence - right.effectiveSequence ||
    left.epochMilliseconds - right.epochMilliseconds ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function freezeIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...ids]);
}

function foldDisclosureTyped(
  events: readonly ParsedDisclosureEvent[],
  targetSequence: number,
): ReaderFactState {
  const ordered = events
    .filter((event) => event.effectiveSequence <= targetSequence)
    .sort(compareEvents);
  const appliedEventIds: string[] = [];
  let activeDisclosureId: string | null = null;
  let state: ReaderFactState = Object.freeze({
    status: 'unknown',
    sourceDisclosureId: null,
    appliedEventIds: freezeIds(appliedEventIds),
  });

  for (const event of ordered) {
    if (event.kind === 'disclose') {
      activeDisclosureId = event.id;
      appliedEventIds.push(event.id);
      state = Object.freeze({
        status: event.status,
        sourceDisclosureId: event.id,
        appliedEventIds: freezeIds(appliedEventIds),
      });
      continue;
    }

    if (activeDisclosureId === null || event.retractsDisclosureId !== activeDisclosureId) {
      throw new DisclosurePolicyError(
        'INVALID_DISCLOSURE_RETRACTION',
        'retraction must target current active disclosure',
      );
    }
    appliedEventIds.push(event.id);
    state = Object.freeze({
      status: 'retracted',
      sourceDisclosureId: activeDisclosureId,
      retractionId: event.id,
      appliedEventIds: freezeIds(appliedEventIds),
    });
    activeDisclosureId = null;
  }

  return state;
}

export function foldDisclosureEvents(
  eventsInput: unknown,
  factIdInput: unknown,
  targetSequenceInput: unknown,
): ReaderFactState {
  try {
    const factId = nonEmptyString(factIdInput, fail, 'factId');
    const targetSequence = nonNegativeSafeInteger(targetSequenceInput, fail, 'targetSequence');
    const events = denseArray(eventsInput, fail, 'events').map((raw, index) =>
      parseDisclosure(raw, index, factId),
    );
    const ids = new Set<string>();
    for (const event of events) {
      if (ids.has(event.id)) return fail('duplicate event ID');
      ids.add(event.id);
    }
    return foldDisclosureTyped(events, targetSequence);
  } catch (error) {
    if (error instanceof DisclosurePolicyError) throw error;
    return fail('disclosure input invalid');
  }
}
