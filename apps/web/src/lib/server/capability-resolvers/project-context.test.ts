import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../server/domain/queries', () => ({
  getMyProject: vi.fn(),
  getProjectOutline: vi.fn(),
}));

import {
  resolveProjectWritingContext,
  type ProjectContextDependencies,
} from './project-context';

const project = (title: string) => ({ title });
const chapter = (
  title: string,
  ordinal: number | null,
  extra: Record<string, unknown> = {},
) => ({
  entityType: 'chapter' as const,
  title,
  ordinal,
  ...extra,
});

function deps(input: {
  projects?: Record<string, { title: string } | null>;
  outline?: ReadonlyArray<{
    entityType: string;
    title: string;
    ordinal: number | null;
    [key: string]: unknown;
  }>;
}): ProjectContextDependencies {
  return {
    getProject: vi.fn(async (projectId: string) => input.projects?.[projectId] ?? null),
    getOutline: vi.fn(async () => input.outline ?? []),
  };
}

describe('resolveProjectWritingContext', () => {
  test('resolves the exact requested owner project even when multiple projects exist', async () => {
    const dependencies = deps({
      projects: {
        'project-a': project('Proyek A'),
        'project-b': project('Proyek B'),
      },
      outline: [chapter('Bab Milik B', 2)],
    });

    const result = await resolveProjectWritingContext('project-b', dependencies);

    expect(result).toEqual({
      kind: 'choose',
      projectTitle: 'Proyek B',
      choices: [{ title: 'Bab Milik B', ordinal: 2 }],
    });
    expect(dependencies.getProject).toHaveBeenCalledTimes(1);
    expect(dependencies.getProject).toHaveBeenCalledWith('project-b');
    expect(dependencies.getOutline).toHaveBeenCalledTimes(1);
    expect(dependencies.getOutline).toHaveBeenCalledWith('project-b');
  });

  test(
    'has no first-project fallback and returns the same not_found shape for foreign and random IDs',
    async () => {
      const dependencies = deps({ projects: { owned: project('Owned') } });

      await expect(resolveProjectWritingContext('foreign', dependencies)).resolves.toEqual({
        kind: 'not_found',
      });
      await expect(
        resolveProjectWritingContext('00000000-0000-4000-8000-999999999999', dependencies),
      ).resolves.toEqual({ kind: 'not_found' });
      expect(dependencies.getOutline).not.toHaveBeenCalled();
    },
  );

  test(
    'returns choose for chapter nodes and never infers resume from first, lowest, only, or accepted prose',
    async () => {
      const dependencies = deps({
        projects: { owned: project('Owned') },
        outline: [
          chapter('Bab Ordinal Tinggi', 9, { acceptedProseVersionId: 'accepted-prose' }),
          chapter('Bab Ordinal Rendah', 1),
        ],
      });

      const result = await resolveProjectWritingContext('owned', dependencies);
      expect(result.kind).toBe('choose');
      if (result.kind !== 'choose') throw new Error('expected choose');
      expect(result.choices).toEqual([
        { title: 'Bab Ordinal Tinggi', ordinal: 9 },
        { title: 'Bab Ordinal Rendah', ordinal: 1 },
      ]);
      expect(result).not.toHaveProperty('chapterId');
      expect(result).not.toHaveProperty('href');
      expect(JSON.stringify(result)).not.toMatch(/resume|accepted-prose/i);
    },
  );

  test('keeps one real chapter as choose rather than auto-resolving it', async () => {
    const dependencies = deps({
      projects: { owned: project('Owned') },
      outline: [chapter('Satu-satunya Bab', null)],
    });

    await expect(resolveProjectWritingContext('owned', dependencies)).resolves.toEqual({
      kind: 'choose',
      projectTitle: 'Owned',
      choices: [{ title: 'Satu-satunya Bab' }],
    });
  });

  test('returns OUTLINE_REQUIRED for an owned project with an empty outline', async () => {
    const dependencies = deps({ projects: { owned: project('Owned') }, outline: [] });

    await expect(resolveProjectWritingContext('owned', dependencies)).resolves.toEqual({
      kind: 'blocked',
      projectTitle: 'Owned',
      reason: 'OUTLINE_REQUIRED',
    });
  });

  test('returns NO_CHAPTER_AVAILABLE when outline exists but has no chapter nodes', async () => {
    const dependencies = deps({
      projects: { owned: project('Owned') },
      outline: [
        { entityType: 'roadmap', title: 'Roadmap', ordinal: null },
        { entityType: 'beat', title: 'Beat', ordinal: 1 },
      ],
    });

    await expect(resolveProjectWritingContext('owned', dependencies)).resolves.toEqual({
      kind: 'blocked',
      projectTitle: 'Owned',
      reason: 'NO_CHAPTER_AVAILABLE',
    });
  });

  test('choice view exposes only author-facing title and optional ordinal', async () => {
    const dependencies = deps({
      projects: { owned: project('Owned') },
      outline: [
        chapter('Bab Aman', 3, {
          id: 'raw-chapter-id',
          projectId: 'raw-project-id',
          href: '/forbidden',
        }),
      ],
    });

    const result = await resolveProjectWritingContext('owned', dependencies);
    expect(result.kind).toBe('choose');
    if (result.kind !== 'choose') throw new Error('expected choose');
    expect(result.choices).toEqual([{ title: 'Bab Aman', ordinal: 3 }]);
    expect(Object.keys(result.choices[0]!)).toEqual(['title', 'ordinal']);
    expect(JSON.stringify(result.choices)).not.toContain('raw-chapter-id');
    expect(JSON.stringify(result.choices)).not.toContain('/forbidden');
  });
});
