import {
  calculateFoundationReadiness,
  toReadinessInput,
  type JsonObject,
} from '@narraza/application';
import { describe, expect, test, vi } from 'vitest';
import { makeFoundationReadinessViewModel } from './foundation-readiness-view-model';

vi.mock('server-only', () => ({}));

const position = (sequence: number, chapterId = `chapter-${sequence}`) => ({
  chapterId,
  sequence,
});

function payload(): JsonObject {
  return {
    coreConcept: 'Janji membawa harga tersembunyi.',
    mainCharacter: {
      id: 'main',
      active: true,
      identity: 'Kurir idealis',
      goal: 'Mengantar surat terakhir',
      motivation: 'Melindungi adiknya',
      address: 'Mira',
      speechStyle: 'Singkat dan formal',
    },
    relationships: [
      {
        fromCharacterId: 'other',
        toCharacterId: 'main',
        active: true,
        description: 'Mantan sekutu yang harus bekerja sama',
      },
    ],
    conflict: 'Penerima ingin surat itu dihancurkan.',
    endingDirection: 'Mira memilih pengasingan.',
    readerPromise: 'Misteri moral dengan jawaban tuntas.',
    secrets: [
      {
        truth: 'Mira menulis surat itu.',
        targetPosition: position(8),
        breadcrumbPositions: [position(2), position(5)],
      },
    ],
  };
}

function expectPolicyParity(candidate: JsonObject) {
  const expected = calculateFoundationReadiness(toReadinessInput(candidate));
  const actual = makeFoundationReadinessViewModel(candidate);

  expect(actual.available).toBe(true);
  if (!actual.available) throw new Error('readiness unexpectedly unavailable');
  expect(actual.percent).toBe(expected.percent);
  expect(
    actual.checklist.map(({ key, weight, earned, complete }) => ({
      key,
      weight,
      earned,
      complete,
    })),
  ).toEqual(expected.checklist);
  expect(actual.checklist.map((item) => item.key)).toEqual(
    expected.checklist.map((item) => item.key),
  );
}

describe('foundation readiness view model', () => {
  test('matches authoritative domain policy for complete projection', () => {
    expectPolicyParity(payload());
  });

  test('matches policy when relationship does not connect to active main character', () => {
    const candidate: Record<string, unknown> = { ...payload() };
    candidate.relationships = [
      {
        fromCharacterId: 'one',
        toCharacterId: 'other',
        active: true,
        description: 'Relasi valid secara bentuk tetapi bukan milik karakter utama',
      },
    ];

    expectPolicyParity(candidate as JsonObject);
    const view = makeFoundationReadinessViewModel(candidate as JsonObject);
    expect(
      view.available && view.checklist.find((item) => item.key === 'main_relationship')?.earned,
    ).toBe(0);
  });

  test('matches policy for blank address and speech style without changing checklist order', () => {
    const candidate: Record<string, unknown> = { ...payload() };
    candidate.mainCharacter = {
      ...(candidate.mainCharacter as JsonObject),
      address: '   ',
      speechStyle: '\u2003',
    };

    expectPolicyParity(candidate as JsonObject);
    const view = makeFoundationReadinessViewModel(candidate as JsonObject);
    expect(
      view.available
        ? view.checklist
            .filter((item) => item.key === 'character_address' || item.key === 'speech_style')
            .map((item) => item.earned)
        : [],
    ).toEqual([0, 0]);
  });

  test('matches policy when secret breadcrumbs are duplicated or ordered at and after reveal', () => {
    for (const breadcrumbPositions of [[position(2), position(2)], [position(8)], [position(9)]]) {
      const candidate: Record<string, unknown> = { ...payload() };
      candidate.secrets = [
        {
          truth: 'Mira menulis surat itu.',
          targetPosition: position(8),
          breadcrumbPositions,
        },
      ];

      expectPolicyParity(candidate);
      const view = makeFoundationReadinessViewModel(candidate);
      expect(view.available && view.checklist.at(-1)?.earned).toBe(7);
    }
  });

  test('returns honest unavailable state for malformed readiness projection', () => {
    const candidate: Record<string, unknown> = { ...payload() };
    candidate.relationships = [{ fromCharacterId: 'main' }];

    expect(makeFoundationReadinessViewModel(candidate as JsonObject)).toEqual({
      available: false,
      message: 'Kesiapan belum dapat dihitung karena data fondasi perlu diperbaiki.',
    });
  });

  test('returns honest unavailable state before foundation exists', () => {
    expect(makeFoundationReadinessViewModel(null)).toEqual({
      available: false,
      message: 'Kesiapan akan dihitung setelah draft fondasi tersedia.',
    });
  });
});
