import { describe, expect, test, vi } from 'vitest';
import type { FoundationRecord, JsonObject, ProjectRecord } from '../ports/types.js';
import type { TxPorts, UnitOfWork } from '../ports/unit-of-work.js';
import { createUpdateFoundationDraft } from './foundation.js';

const project: ProjectRecord = {
  id: 'project-owner-a',
  ownerUserId: 'owner-a',
  title: 'Cerita',
  intakePath: 'rough_idea',
  status: 'active',
  currentCanonicalVersion: 0,
  revision: 0,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const originalPayload = {
  coreConcept: 'Konsep lama',
  conflict: 'Konflik tetap',
  endingDirection: 'Akhir tetap',
  readerPromise: 'Janji tetap',
  unsupportedTopLevel: { nested: ['harus', 'utuh'], enabled: true },
  mainCharacter: {
    id: 'maya',
    active: true,
    identity: 'Maya',
    goal: 'Pulang',
    motivation: 'Rindu',
    address: 'May',
    speechStyle: 'Tenang',
    unsupportedCharacterField: { exact: 17 },
  },
  relationships: [
    {
      fromCharacterId: 'maya',
      toCharacterId: 'ratna',
      active: true,
      description: 'Ibu mertua',
      privateNote: 'satu',
    },
    {
      fromCharacterId: 'maya',
      toCharacterId: 'dewi',
      active: true,
      description: 'Sahabat',
      privateNote: 'dua',
    },
  ],
  secrets: [
    {
      truth: 'Rahasia pertama',
      targetPosition: { chapterId: 'chapter-20', sequence: 20, unsupportedPosition: 'keep' },
      breadcrumbPositions: [
        { chapterId: 'chapter-2', sequence: 2 },
        { chapterId: 'chapter-5', sequence: 5 },
        { chapterId: 'chapter-9', sequence: 9 },
      ],
      unsupportedSecretField: ['keep'],
    },
    {
      truth: 'Rahasia kedua',
      targetPosition: { chapterId: 'chapter-30', sequence: 30 },
      breadcrumbPositions: [{ chapterId: 'chapter-14', sequence: 14 }],
    },
  ],
} satisfies JsonObject;

function foundation(payload: JsonObject, revision = 4): FoundationRecord {
  return {
    id: 'foundation-a',
    projectId: project.id,
    status: 'draft',
    revision,
    confirmedAt: null,
    lockedAt: null,
    schemaVersion: 1,
    payload,
  };
}

describe('foundation draft lossless merge', () => {
  test('unrelated field edit preserves every unsupported field and complete arrays exactly', async () => {
    let persistedPayload: JsonObject = originalPayload;
    const updateDraft = vi.fn(async (_projectId: string, payload: JsonObject, revision: number) => {
      persistedPayload = payload;
      return foundation(payload, revision + 1);
    });
    const ports = {
      project: { findByIdForOwner: vi.fn(async () => project) },
      foundation: {
        findByProjectId: vi.fn(async () => foundation(originalPayload)),
        updateDraft,
      },
    } as unknown as TxPorts;
    const uow: UnitOfWork = { execute: async (work) => work(ports) };

    const result = await createUpdateFoundationDraft(uow)({
      ownerUserId: project.ownerUserId,
      projectId: project.id,
      expectedRevision: 4,
      mergeExisting: true,
      payload: {
        coreConcept: 'Konsep baru',
        conflict: originalPayload.conflict,
        endingDirection: originalPayload.endingDirection,
        readerPromise: originalPayload.readerPromise,
        mainCharacter: {
          id: 'maya',
          active: true,
          identity: 'Maya',
          goal: 'Pulang',
          motivation: 'Rindu',
          address: 'May',
          speechStyle: 'Tenang',
        },
        relationships: [
          {
            fromCharacterId: 'maya',
            toCharacterId: 'ratna',
            active: true,
            description: 'Ibu mertua',
          },
        ],
        secrets: [
          {
            truth: 'Rahasia pertama',
            targetPosition: { chapterId: 'chapter-20', sequence: 20 },
            breadcrumbPositions: [
              { chapterId: 'chapter-2', sequence: 2 },
              { chapterId: 'chapter-5', sequence: 5 },
            ],
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(persistedPayload).toEqual({ ...originalPayload, coreConcept: 'Konsep baru' });
    expect(persistedPayload.relationships).toEqual(originalPayload.relationships);
    expect(persistedPayload.secrets).toEqual(originalPayload.secrets);
    expect(updateDraft).toHaveBeenCalledWith(project.id, persistedPayload, 4);
  });

  test('foreign owner fails closed before foundation payload read', async () => {
    const findFoundation = vi.fn();
    const ports = {
      project: { findByIdForOwner: vi.fn(async () => null) },
      foundation: { findByProjectId: findFoundation },
    } as unknown as TxPorts;
    const uow: UnitOfWork = { execute: async (work) => work(ports) };

    const result = await createUpdateFoundationDraft(uow)({
      ownerUserId: 'owner-b',
      projectId: project.id,
      expectedRevision: 4,
      mergeExisting: true,
      payload: { coreConcept: 'Serangan' },
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(findFoundation).not.toHaveBeenCalled();
  });
});
