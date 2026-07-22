import {
  exactObject,
  nonEmptyString,
  nonNegativeSafeInteger,
  type Fail,
} from '../validation/exact.js';

export type ProsePolicyErrorCode =
  | 'INVALID_PROSE_POLICY_INPUT'
  | 'ACCEPTED_PROSE_IMMUTABLE'
  | 'WORKING_DRAFT_REVISION_MISMATCH'
  | 'PROSE_VERSION_BEAT_MISMATCH';

export class ProsePolicyError extends Error {
  constructor(
    readonly code: ProsePolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProsePolicyError';
  }
}

const SHA_256 = /^[0-9a-f]{64}$/;
const fail: Fail = (message) => {
  throw new ProsePolicyError('INVALID_PROSE_POLICY_INPUT', message);
};

function contentHash(value: unknown, label: string): string {
  return typeof value === 'string' && SHA_256.test(value) ? value : fail(`${label} invalid`);
}

export function assertAcceptedProseImmutable(input: unknown): { readonly allowed: true } {
  try {
    const record = exactObject(
      input,
      ['acceptedContentHash', 'proposedContentHash'],
      fail,
      'accepted prose',
    );
    const acceptedContentHash = contentHash(record.acceptedContentHash, 'acceptedContentHash');
    const proposedContentHash = contentHash(record.proposedContentHash, 'proposedContentHash');

    if (acceptedContentHash !== proposedContentHash) {
      throw new ProsePolicyError('ACCEPTED_PROSE_IMMUTABLE', 'accepted prose cannot change');
    }

    return Object.freeze({ allowed: true });
  } catch (error) {
    if (error instanceof ProsePolicyError) throw error;
    return fail('accepted prose input invalid');
  }
}

export function decideWorkingDraftUpdate(input: unknown): {
  readonly allowed: true;
  readonly nextRevision: number;
} {
  try {
    const record = exactObject(
      input,
      ['currentRevision', 'expectedRevision'],
      fail,
      'draft update',
    );
    const currentRevision = nonNegativeSafeInteger(record.currentRevision, fail, 'currentRevision');
    const expectedRevision = nonNegativeSafeInteger(
      record.expectedRevision,
      fail,
      'expectedRevision',
    );

    if (currentRevision !== expectedRevision) {
      throw new ProsePolicyError('WORKING_DRAFT_REVISION_MISMATCH', 'revision mismatch');
    }
    if (currentRevision === Number.MAX_SAFE_INTEGER) return fail('next revision unsafe');

    return Object.freeze({ allowed: true, nextRevision: currentRevision + 1 });
  } catch (error) {
    if (error instanceof ProsePolicyError) throw error;
    return fail('draft input invalid');
  }
}

export function decideAcceptedPointer(input: unknown): {
  readonly allowed: true;
  readonly proseVersionId: string;
} {
  try {
    const record = exactObject(
      input,
      ['beatId', 'proseVersionId', 'proseVersionBeatId'],
      fail,
      'accepted pointer',
    );
    const beatId = nonEmptyString(record.beatId, fail, 'beatId');
    const proseVersionId = nonEmptyString(record.proseVersionId, fail, 'proseVersionId');
    const proseVersionBeatId = nonEmptyString(
      record.proseVersionBeatId,
      fail,
      'proseVersionBeatId',
    );

    if (beatId !== proseVersionBeatId) {
      throw new ProsePolicyError(
        'PROSE_VERSION_BEAT_MISMATCH',
        'prose version belongs to another beat',
      );
    }

    return Object.freeze({ allowed: true, proseVersionId });
  } catch (error) {
    if (error instanceof ProsePolicyError) throw error;
    return fail('pointer input invalid');
  }
}

export function isValidationBindingCurrent(input: unknown): boolean {
  try {
    const record = exactObject(
      input,
      ['validationContentHash', 'currentContentHash'],
      fail,
      'validation binding',
    );
    const validationContentHash = contentHash(
      record.validationContentHash,
      'validationContentHash',
    );
    const currentContentHash = contentHash(record.currentContentHash, 'currentContentHash');

    return validationContentHash === currentContentHash;
  } catch (error) {
    if (error instanceof ProsePolicyError) throw error;
    return fail('binding input invalid');
  }
}
