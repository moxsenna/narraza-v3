import { describe, expect, test } from 'vitest';

import {
  deriveSceneConfirmationIdentity,
  deterministicNamespacedUuid,
  SCENE_JOB_ID_NAMESPACE,
  SCENE_RESERVATION_ID_NAMESPACE,
} from './confirmation-identity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicNamespacedUuid', () => {
  test('is deterministic for the same namespace and name', () => {
    const first = deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, 'quote-1');
    const second = deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, 'quote-1');
    expect(first).toBe(second);
  });

  test('differs across names and namespaces', () => {
    expect(deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, 'quote-1')).not.toBe(
      deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, 'quote-2'),
    );
    expect(deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, 'quote-1')).not.toBe(
      deterministicNamespacedUuid(SCENE_RESERVATION_ID_NAMESPACE, 'quote-1'),
    );
  });

  test('emits RFC 4122 version-5 variant UUID shapes', () => {
    expect(deterministicNamespacedUuid(SCENE_RESERVATION_ID_NAMESPACE, 'quote-3')).toMatch(
      UUID_PATTERN,
    );
  });

  test('rejects malformed namespaces', () => {
    expect(() => deterministicNamespacedUuid('not-a-namespace', 'quote')).toThrow(
      'invalid deterministic uuid namespace',
    );
  });
});

describe('deriveSceneConfirmationIdentity', () => {
  test('same quote derives the same stable confirmation identity', () => {
    const first = deriveSceneConfirmationIdentity('11111111-1111-4111-8111-111111111111');
    const second = deriveSceneConfirmationIdentity('11111111-1111-4111-8111-111111111111');
    expect(first).toEqual(second);
    expect(first.confirmationRequestId).toBe('11111111-1111-4111-8111-111111111111');
    expect(first.reservationId).toMatch(UUID_PATTERN);
    expect(first.jobId).toMatch(UUID_PATTERN);
  });

  test('different quotes derive different reservation and job ids', () => {
    const first = deriveSceneConfirmationIdentity('11111111-1111-4111-8111-111111111111');
    const second = deriveSceneConfirmationIdentity('22222222-2222-4222-8222-222222222222');
    expect(first.reservationId).not.toBe(second.reservationId);
    expect(first.jobId).not.toBe(second.jobId);
  });

  test('reservation and job namespaces never collide', () => {
    const identity = deriveSceneConfirmationIdentity('33333333-3333-4333-8333-333333333333');
    expect(identity.reservationId).not.toBe(identity.jobId);
  });

  test('identity does not depend on user id or cost', () => {
    // Only the quote id participates; callers pass no user or amount input.
    const identity = deriveSceneConfirmationIdentity('44444444-4444-4444-8444-444444444444');
    expect(JSON.stringify(identity)).not.toContain('userId');
    expect(JSON.stringify(identity)).not.toContain('cost');
  });
});
