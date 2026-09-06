import { createHash } from 'node:crypto';

/**
 * Deterministic confirmation identity for the scene generation flow (Task 6
 * exact-replay contract). A quote is a server-issued, single-use artifact, so
 * its id is the stable confirmation identity: the same quote always derives
 * the same reservation/job pair, a different quote derives a different pair,
 * and no client-controlled value (user id, cost) participates. Separate fixed
 * namespaces keep the two derived ids independent.
 */
export const SCENE_RESERVATION_ID_NAMESPACE = '6f1c0b2a-4a5e-4c8d-9a3b-1d2e3f4a5b6c';
export const SCENE_JOB_ID_NAMESPACE = '9b7d5e4f-2c3a-4b8e-8d1f-0a9b8c7d6e5f';

/** RFC 4122 v5-shaped deterministic UUID (SHA-1, namespaced). */
export function deterministicNamespacedUuid(namespace: string, name: string): string {
  const hex = namespace.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('invalid deterministic uuid namespace');
  const namespaceBytes = Buffer.from(hex, 'hex');
  const digest = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
  const bytes = digest.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function deriveSceneConfirmationIdentity(quoteId: string): {
  readonly confirmationRequestId: string;
  readonly reservationId: string;
  readonly jobId: string;
} {
  return {
    confirmationRequestId: quoteId,
    reservationId: deterministicNamespacedUuid(SCENE_RESERVATION_ID_NAMESPACE, quoteId),
    jobId: deterministicNamespacedUuid(SCENE_JOB_ID_NAMESPACE, quoteId),
  };
}

const M4_RESERVATION_ID_NAMESPACE = '3e8a1c6d-7b4f-4e2a-9d5c-6f0a8b1c2d3e';
const M4_JOB_ID_NAMESPACE = '5c2d9e7a-1b6f-4c8d-8a3b-9e0f1a2b3c4d';

/**
 * M4 workflow confirmation identity: same contract as the scene derivation —
 * the server-issued quote id is the only input, so identical quotes replay to
 * the identical reservation/job pair and no client value participates.
 */
export function deriveM4ConfirmationIdentity(quoteId: string): {
  readonly confirmationRequestId: string;
  readonly reservationId: string;
  readonly jobId: string;
} {
  return {
    confirmationRequestId: quoteId,
    reservationId: deterministicNamespacedUuid(M4_RESERVATION_ID_NAMESPACE, quoteId),
    jobId: deterministicNamespacedUuid(M4_JOB_ID_NAMESPACE, quoteId),
  };
}
