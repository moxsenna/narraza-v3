import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PREVIEW_PRESENTATION_FIXTURES } from './presentation-fixtures';

describe('preview presentation fixtures', () => {
  test('are tenant-free and contain no project or chapter identifiers', () => {
    const serialized = JSON.stringify(PREVIEW_PRESENTATION_FIXTURES);
    expect(serialized).not.toMatch(/projectId|chapterId|ownerUserId|userId|href/i);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });

  test('contains only presentation data needed by the approved scenarios', () => {
    expect(PREVIEW_PRESENTATION_FIXTURES['kredit-unavailable']).toEqual({
      kind: 'kredit',
    });
    expect(PREVIEW_PRESENTATION_FIXTURES['tulis-outline-required']).toEqual({
      kind: 'tulis',
      projectTitle: 'Novel Contoh',
      state: 'OUTLINE_REQUIRED',
    });
    expect(PREVIEW_PRESENTATION_FIXTURES['tulis-no-chapter']).toEqual({
      kind: 'tulis',
      projectTitle: 'Novel Contoh',
      state: 'NO_CHAPTER_AVAILABLE',
    });
    expect(PREVIEW_PRESENTATION_FIXTURES['tulis-choose']).toEqual({
      kind: 'tulis',
      projectTitle: 'Novel Contoh',
      state: 'choose',
      choices: [
        { title: 'Pertemuan di Stasiun', ordinal: 1 },
        { title: 'Surat yang Tertinggal', ordinal: 2 },
      ],
    });
  });
});
