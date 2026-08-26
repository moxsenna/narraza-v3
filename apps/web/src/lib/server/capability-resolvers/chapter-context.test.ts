import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../server/domain/queries', () => ({
  getMyProject: vi.fn(),
  getProjectOutline: vi.fn(),
}));

import { resolveChapterContext, type ChapterContextDependencies } from './chapter-context';

const project = (title: string) => ({ title });
const chapterNode = (id: string, title: string, ordinal: number | null) => ({
  entityType: 'chapter' as const,
  id,
  title,
  ordinal,
});

function deps(input: {
  projects?: Record<string, { title: string } | null>;
  outline?: ReadonlyArray<{
    entityType: string;
    id: string;
    title: string;
    ordinal: number | null;
    [key: string]: unknown;
  }>;
}): ChapterContextDependencies {
  return {
    getProject: vi.fn(async (projectId: string) => input.projects?.[projectId] ?? null),
    getOutline: vi.fn(async () => input.outline ?? []),
  };
}

describe('resolveChapterContext', () => {
  test('resolves owner project + owner chapter', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext('project-a', 'ch-1', dependencies);

    expect(result).toEqual({
      kind: 'resolved',
      projectTitle: 'Proyek A',
      chapterTitle: 'Bab Satu',
      chapterOrdinal: 1,
    });
    expect(dependencies.getProject).toHaveBeenCalledWith('project-a');
    expect(dependencies.getOutline).toHaveBeenCalledWith('project-a');
  });

  test('returns not_found for foreign project', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext('foreign-project', 'ch-1', dependencies);

    expect(result).toEqual({ kind: 'not_found' });
    expect(dependencies.getProject).toHaveBeenCalledWith('foreign-project');
    expect(dependencies.getOutline).not.toHaveBeenCalled();
  });

  test('returns not_found for random project ID', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext(
      '00000000-0000-4000-8000-999999999999',
      'ch-1',
      dependencies,
    );

    expect(result).toEqual({ kind: 'not_found' });
    expect(dependencies.getOutline).not.toHaveBeenCalled();
  });

  test('returns not_found when chapter belongs to different project', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext('project-a', 'foreign-chapter-id', dependencies);

    expect(result).toEqual({ kind: 'not_found' });
  });

  test('returns not_found for random chapter ID on valid project', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext(
      'project-a',
      '00000000-0000-4000-8000-aaaaaaaaaaaa',
      dependencies,
    );

    expect(result).toEqual({ kind: 'not_found' });
  });

  test('does not have first-chapter fallback', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-2', 'Bab Dua', 2), chapterNode('ch-1', 'Bab Satu', 1)],
    });

    // Requesting second chapter should still resolve correctly
    const result = await resolveChapterContext('project-a', 'ch-2', dependencies);

    expect(result).toEqual({
      kind: 'resolved',
      projectTitle: 'Proyek A',
      chapterTitle: 'Bab Dua',
      chapterOrdinal: 2,
    });
  });

  test('rejects fake/synthetic chapter IDs', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('ch-1', 'Bab Satu', 1)],
    });

    const result = await resolveChapterContext('project-a', 'main', dependencies);

    expect(result).toEqual({ kind: 'not_found' });
  });

  test('does not expose raw IDs or internal jargon in ViewModel', async () => {
    const dependencies = deps({
      projects: { 'project-a': project('Proyek A') },
      outline: [chapterNode('raw-id-123', 'Bab Aman', 3)],
    });

    const result = await resolveChapterContext('project-a', 'raw-id-123', dependencies);

    if (result.kind !== 'resolved') throw new Error('expected resolved');
    expect(Object.keys(result)).toEqual(['kind', 'projectTitle', 'chapterTitle', 'chapterOrdinal']);
    expect(JSON.stringify(result)).not.toContain('raw-id');
    expect(JSON.stringify(result)).not.toMatch(/uuid|foundation_id|outline_node/i);
  });
});
