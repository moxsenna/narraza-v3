import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { mapPreviewScenario } from './map-scenario';
import { PREVIEW_PRESENTATION_FIXTURES } from './presentation-fixtures';
import { getPreviewScenario } from './scenario-registry';

describe('preview scenario mapper', () => {
  test('maps approved fixture to public presentation without internal scenario state', () => {
    const scenario = getPreviewScenario('tulis-choose');
    if (!scenario) throw new Error('scenario missing');

    const mapped = mapPreviewScenario(scenario, PREVIEW_PRESENTATION_FIXTURES['tulis-choose']);

    expect(mapped).toEqual({
      view: 'tulis',
      projectTitle: 'Novel Contoh',
      state: 'choose',
      choices: [
        { title: 'Pertemuan di Stasiun', ordinal: 1 },
        { title: 'Surat yang Tertinggal', ordinal: 2 },
      ],
      actionsDisabled: true,
    });
    expect(mapped).not.toHaveProperty('scenarioKey');
    expect(mapped).not.toHaveProperty('scope');
    expect(mapped).not.toHaveProperty('capabilityMode');
    expect(JSON.stringify(mapped)).not.toMatch(/projectId|chapterId|ownerUserId|userId/i);
  });

  test('always disables actions for every preview view', () => {
    for (const key of [
      'kredit-unavailable',
      'tulis-choose',
      'tulis-outline-required',
      'tulis-no-chapter',
    ] as const) {
      const scenario = getPreviewScenario(key);
      if (!scenario) throw new Error(`scenario missing: ${key}`);
      expect(mapPreviewScenario(scenario, PREVIEW_PRESENTATION_FIXTURES[key]).actionsDisabled).toBe(
        true,
      );
    }
  });
});
