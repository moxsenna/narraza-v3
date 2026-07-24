import { describe, expect, it } from 'vitest';
import {
  projectProgressView,
  type ProjectProgressSnapshot,
} from './project-progress-view.js';

const base = (over: Partial<ProjectProgressSnapshot> = {}): ProjectProgressSnapshot => ({
  projectStatus: 'active',
  hasIntakeMessages: false,
  foundationStatus: 'none',
  characterCount: 0,
  factCount: 0,
  chapterCount: 0,
  beatWithAcceptedProseCount: 0,
  ...over,
});

describe('progress-view', () => {
  it('empty project → intake stage', () => {
    const v = projectProgressView(base());
    expect(v.stage).toBe('intake');
    expect(v.nextAction.code).toBe('continue_intake');
    expect(v.blockers).toContain('intake_empty');
  });

  it('intake done, no foundation → foundation stage', () => {
    const v = projectProgressView(
      base({ hasIntakeMessages: true, foundationStatus: null }),
    );
    expect(v.stage).toBe('foundation');
    expect(v.nextAction.code).toBe('fill_foundation');
  });

  it('foundation draft → fill foundation', () => {
    const v = projectProgressView(
      base({ hasIntakeMessages: true, foundationStatus: 'draft' }),
    );
    expect(v.stage).toBe('foundation');
    expect(v.blockers).toContain('foundation_unlocked');
  });

  it('foundation confirmed → lock foundation', () => {
    const v = projectProgressView(
      base({ hasIntakeMessages: true, foundationStatus: 'confirmed' }),
    );
    expect(v.stage).toBe('foundation');
    expect(v.nextAction.code).toBe('lock_foundation');
    expect(v.blockers).toContain('foundation_not_locked');
  });

  it('foundation locked, no chapters → planning', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 0,
      }),
    );
    expect(v.stage).toBe('planning');
    expect(v.nextAction.code).toBe('build_outline');
    expect(v.blockers).toContain('outline_empty');
  });

  it('chapters exist → writing stage', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 10,
        characterCount: 2,
        factCount: 1,
      }),
    );
    expect(v.stage).toBe('writing');
    expect(v.nextAction.code).toBe('write_beat');
    expect(v.counts.chapters).toBe(10);
    expect(v.counts.characters).toBe(2);
  });

  it('accepted beats → continue writing', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 10,
        beatWithAcceptedProseCount: 2,
      }),
    );
    expect(v.stage).toBe('writing');
    expect(v.nextAction.code).toBe('continue_writing');
    expect(v.counts.acceptedBeats).toBe(2);
  });
});
