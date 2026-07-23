import { describe, expect, it } from 'vitest';
import { hostileObjects } from '../validation/hostile-fixtures.test.js';
import {
  assertAcceptedProseImmutable,
  decideAcceptedPointer,
  decideWorkingDraftUpdate,
  isValidationBindingCurrent,
  ProsePolicyError,
  type ProsePolicyErrorCode,
} from './prose-policy.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const acceptedInput = {
  acceptedContentHash: HASH_A,
  proposedContentHash: HASH_A,
};
const draftInput = { currentRevision: 1, expectedRevision: 1 };
const pointerInput = {
  beatId: 'beat-1',
  proseVersionId: 'prose-1',
  proseVersionBeatId: 'beat-1',
};
const bindingInput = {
  validationContentHash: HASH_A,
  currentContentHash: HASH_A,
};

const expectOwnedError = (
  action: () => unknown,
  code: ProsePolicyErrorCode = 'INVALID_PROSE_POLICY_INPUT',
) => {
  expect(action).toThrow(ProsePolicyError);
  expect(action).not.toThrow(TypeError);
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ name: 'ProsePolicyError', code });
  }
};

const blocked = (): never => {
  throw new Error('blocked');
};

describe('accepted prose immutability', () => {
  it('allows only equal lowercase SHA-256 content hashes and freezes decision', () => {
    const result = assertAcceptedProseImmutable(acceptedInput);

    expect(result).toEqual({ allowed: true });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects changed content with accepted prose immutable code', () => {
    expectOwnedError(
      () =>
        assertAcceptedProseImmutable({
          acceptedContentHash: HASH_A,
          proposedContentHash: HASH_B,
        }),
      'ACCEPTED_PROSE_IMMUTABLE',
    );
  });
});

describe('working draft CAS', () => {
  it('allows matching expected revision, safely increments it, and freezes decision', () => {
    const result = decideWorkingDraftUpdate(draftInput);

    expect(result).toEqual({ allowed: true, nextRevision: 2 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects stale expected revision with revision mismatch code', () => {
    expectOwnedError(
      () => decideWorkingDraftUpdate({ currentRevision: 2, expectedRevision: 1 }),
      'WORKING_DRAFT_REVISION_MISMATCH',
    );
  });

  it('rejects maximum safe revision because increment would be unsafe', () => {
    expectOwnedError(() =>
      decideWorkingDraftUpdate({
        currentRevision: Number.MAX_SAFE_INTEGER,
        expectedRevision: Number.MAX_SAFE_INTEGER,
      }),
    );
  });
});

describe('accepted prose pointer ownership', () => {
  it('allows prose version owned by same beat and freezes decision', () => {
    const result = decideAcceptedPointer(pointerInput);

    expect(result).toEqual({ allowed: true, proseVersionId: 'prose-1' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects cross-beat pointer with beat mismatch code', () => {
    expectOwnedError(
      () => decideAcceptedPointer({ ...pointerInput, proseVersionBeatId: 'beat-2' }),
      'PROSE_VERSION_BEAT_MISMATCH',
    );
  });
});

describe('validation binding', () => {
  it('is current only when lowercase SHA-256 content hashes equal', () => {
    expect(isValidationBindingCurrent(bindingInput)).toBe(true);
    expect(
      isValidationBindingCurrent({
        validationContentHash: HASH_A,
        currentContentHash: HASH_B,
      }),
    ).toBe(false);
  });
});

describe('prose policy fail-closed boundaries', () => {
  const boundaries = [
    [assertAcceptedProseImmutable, acceptedInput],
    [decideWorkingDraftUpdate, draftInput],
    [decideAcceptedPointer, pointerInput],
    [isValidationBindingCurrent, bindingInput],
  ] as const;

  for (const [boundary, valid] of boundaries) {
    it.each(hostileObjects(valid).slice(0, -1))(
      `${boundary.name} rejects hostile exact object %# with owned error`,
      (input) => expectOwnedError(() => boundary(input as never)),
    );

    it(`${boundary.name} translates proxy reflection failure`, () => {
      expectOwnedError(() => boundary(new Proxy({ ...valid }, { ownKeys: blocked }) as never));
    });
  }

  it.each([
    [
      assertAcceptedProseImmutable,
      { acceptedContentHash: HASH_A.toUpperCase(), proposedContentHash: HASH_A },
    ],
    [assertAcceptedProseImmutable, { acceptedContentHash: '', proposedContentHash: HASH_A }],
    [decideWorkingDraftUpdate, { currentRevision: '1', expectedRevision: 1 }],
    [decideWorkingDraftUpdate, { currentRevision: -1, expectedRevision: -1 }],
    [decideWorkingDraftUpdate, { currentRevision: 1.5, expectedRevision: 1.5 }],
    [decideAcceptedPointer, { ...pointerInput, beatId: 3 }],
    [decideAcceptedPointer, { ...pointerInput, proseVersionId: '' }],
    [
      isValidationBindingCurrent,
      { validationContentHash: 'A'.repeat(64), currentContentHash: HASH_A },
    ],
    [isValidationBindingCurrent, { validationContentHash: HASH_A, currentContentHash: null }],
  ] as const)('rejects scalar mismatch %# with owned error', (boundary, input) => {
    expectOwnedError(() => boundary(input as never));
  });

  it('parses every accepted prose field before semantic immutability decision', () => {
    expectOwnedError(() =>
      assertAcceptedProseImmutable({
        acceptedContentHash: HASH_A,
        proposedContentHash: HASH_B.toUpperCase(),
      }),
    );
  });

  it('parses every draft field before CAS decision', () => {
    expectOwnedError(() =>
      decideWorkingDraftUpdate({ currentRevision: 2, expectedRevision: 'stale' }),
    );
  });

  it('parses every pointer field before beat ownership decision', () => {
    expectOwnedError(() =>
      decideAcceptedPointer({
        beatId: 'beat-1',
        proseVersionId: 7,
        proseVersionBeatId: 'beat-2',
      }),
    );
  });

  it('rejects accessors without invoking any field getter', () => {
    for (const [boundary, valid] of boundaries) {
      for (const key of Object.keys(valid)) {
        let reads = 0;
        const input = Object.defineProperty({ ...valid }, key, {
          get: () => {
            reads += 1;
            return valid[key as keyof typeof valid];
          },
          enumerable: true,
        });

        expectOwnedError(() => boundary(input as never));
        expect(reads).toBe(0);
      }
    }
  });
});
