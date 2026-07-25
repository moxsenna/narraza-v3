/**
 * Progress reducer v1 (S9 / progress-view).
 * Shared by dashboard + redirects. M2 stages only; later stages stub nextAction.
 */

export interface ProjectProgressSnapshot {
  readonly projectStatus: string;
  readonly hasIntakeMessages: boolean;
  readonly foundationStatus: 'none' | 'draft' | 'confirmed' | 'locked' | null;
  readonly characterCount: number;
  readonly factCount: number;
  readonly chapterCount: number;
  readonly beatWithAcceptedProseCount: number;
}

export interface ProjectProgressView {
  readonly stage: string;
  readonly blockers: readonly string[];
  readonly nextAction: { readonly code: string; readonly hrefHint: string };
  readonly counts: {
    readonly characters: number;
    readonly facts: number;
    readonly chapters: number;
    readonly acceptedBeats: number;
  };
}

export function projectProgressView(snap: ProjectProgressSnapshot): ProjectProgressView {
  const counts = {
    characters: snap.characterCount,
    facts: snap.factCount,
    chapters: snap.chapterCount,
    acceptedBeats: snap.beatWithAcceptedProseCount,
  };

  const foundation = snap.foundationStatus ?? 'none';
  const blockers: string[] = [];

  if (!snap.hasIntakeMessages) {
    blockers.push('intake_empty');
  }
  if (foundation === 'none' || foundation === 'draft') {
    blockers.push('foundation_unlocked');
  }
  if (foundation === 'confirmed') {
    blockers.push('foundation_not_locked');
  }
  if (foundation === 'locked' && snap.chapterCount === 0) {
    blockers.push('outline_empty');
  }

  // Stage progression (M2 subset).
  let stage: string;
  let nextAction: ProjectProgressView['nextAction'];

  if (!snap.hasIntakeMessages) {
    stage = 'intake';
    nextAction = { code: 'continue_intake', hrefHint: 'chat' };
  } else if (foundation === 'none' || foundation === 'draft' || foundation === 'confirmed') {
    stage = 'foundation';
    nextAction =
      foundation === 'confirmed'
        ? { code: 'lock_foundation', hrefHint: 'fondasi' }
        : { code: 'fill_foundation', hrefHint: 'fondasi' };
  } else if (snap.chapterCount === 0) {
    stage = 'planning';
    nextAction = { code: 'build_outline', hrefHint: 'outline' };
  } else if (snap.beatWithAcceptedProseCount === 0) {
    stage = 'writing';
    nextAction = { code: 'write_beat', hrefHint: 'tulis' };
  } else {
    stage = 'writing';
    nextAction = { code: 'continue_writing', hrefHint: 'tulis' };
  }

  return { stage, blockers, nextAction, counts };
}
