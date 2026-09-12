import { describe, expect, it } from 'vitest';
import {
  intakeSufficiencyView,
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
    const v = projectProgressView(base({ hasIntakeMessages: true, foundationStatus: null }));
    expect(v.stage).toBe('foundation');
    expect(v.nextAction.code).toBe('fill_foundation');
  });

  it('foundation draft → fill foundation', () => {
    const v = projectProgressView(base({ hasIntakeMessages: true, foundationStatus: 'draft' }));
    expect(v.stage).toBe('foundation');
    expect(v.blockers).toContain('foundation_unlocked');
  });

  it('foundation confirmed → lock foundation', () => {
    const v = projectProgressView(base({ hasIntakeMessages: true, foundationStatus: 'confirmed' }));
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

describe('progress-view W5.5', () => {
  it('pending proposals → review stage with close-chapter action and badge', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 3,
        beatWithAcceptedProseCount: 1,
        pendingProposalCount: 2,
      }),
    );
    expect(v.stage).toBe('review');
    expect(v.nextAction).toEqual({ code: 'close_chapter', hrefHint: 'selesaikan' });
    expect(v.badges.pendingProposals).toBe(2);
  });

  it('published artifacts → publish stage (publish wins over review)', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 3,
        beatWithAcceptedProseCount: 2,
        pendingProposalCount: 1,
        artifactPublishedCount: 1,
      }),
    );
    expect(v.stage).toBe('publish');
    expect(v.nextAction).toEqual({ code: 'publish_artifact', hrefHint: 'publish' });
    expect(v.badges.pendingProposals).toBe(1);
  });

  it('W5.5 fields default to zero (backward compatible)', () => {
    const v = projectProgressView(
      base({
        hasIntakeMessages: true,
        foundationStatus: 'locked',
        chapterCount: 3,
      }),
    );
    expect(v.stage).toBe('writing');
    expect(v.badges.pendingProposals).toBe(0);
  });

  it('intake sufficiency: below 3 collected signals keeps chat CTA', () => {
    expect(intakeSufficiencyView({ collectedSignalCount: 0 }).sufficient).toBe(false);
    expect(intakeSufficiencyView({ collectedSignalCount: 2 }).nextAction).toEqual({
      code: 'continue_intake',
      hrefHint: 'chat',
    });
  });

  it('intake sufficiency: 3 fields collected flips CTA to compose concepts', () => {
    const v = intakeSufficiencyView({ collectedSignalCount: 3 });
    expect(v.sufficient).toBe(true);
    expect(v.nextAction).toEqual({ code: 'compose_concepts', hrefHint: 'konsep' });
    // More signals stay sufficient; negatives clamp to zero.
    expect(intakeSufficiencyView({ collectedSignalCount: 7 }).sufficient).toBe(true);
    expect(intakeSufficiencyView({ collectedSignalCount: -4 }).collected).toBe(0);
    expect(intakeSufficiencyView({ collectedSignalCount: NaN }).collected).toBe(0);
  });
});
