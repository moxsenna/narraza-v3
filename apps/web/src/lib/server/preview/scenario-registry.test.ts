import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getPreviewScenario, PREVIEW_SCENARIOS } from './scenario-registry';

describe('preview scenario registry', () => {
  test('uses a closed static allowlist', () => {
    expect(Object.keys(PREVIEW_SCENARIOS)).toEqual([
      'kredit-unavailable',
      'tulis-choose',
      'tulis-outline-required',
      'tulis-no-chapter',
    ]);
  });

  test('denies unknown scenarios rather than deriving fixtures dynamically', () => {
    expect(getPreviewScenario('unknown')).toBeNull();
    expect(getPreviewScenario('')).toBeNull();
  });

  test('marks project writing scenarios as project-scoped and kredit as account-scoped', () => {
    expect(getPreviewScenario('kredit-unavailable')?.scope).toBe('account');
    expect(getPreviewScenario('tulis-choose')?.scope).toBe('project');
    expect(getPreviewScenario('tulis-outline-required')?.scope).toBe('project');
    expect(getPreviewScenario('tulis-no-chapter')?.scope).toBe('project');
  });
});
