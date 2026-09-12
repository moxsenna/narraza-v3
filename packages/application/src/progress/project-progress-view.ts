/**
 * Progress reducer v2 (S9 / progress-view, W5.5). Shared by dashboard,
 * redirects, and sidebar badges. Stage progression covers the full release-1
 * journey: intake → foundation → planning → writing → review → publish.
 * Backward compatible: W5.5 snapshot fields are optional and default to 0.
 */

export interface ProjectProgressSnapshot {
  readonly projectStatus: string;
  readonly hasIntakeMessages: boolean;
  readonly foundationStatus: 'none' | 'draft' | 'confirmed' | 'locked' | null;
  readonly characterCount: number;
  readonly factCount: number;
  readonly chapterCount: number;
  readonly beatWithAcceptedProseCount: number;
  /** W5.5: persisted intake session signal_count (deterministic fields). */
  readonly intakeSignalCount?: number;
  /** W5.5: proposals currently pending a decision. */
  readonly pendingProposalCount?: number;
  /** W5.5: published artifacts (publish stage reached). */
  readonly artifactPublishedCount?: number;
}

export interface ProjectProgressView {
  readonly stage: 'intake' | 'foundation' | 'planning' | 'writing' | 'review' | 'publish';
  readonly blockers: readonly string[];
  readonly nextAction: { readonly code: string; readonly hrefHint: string };
  readonly counts: {
    readonly characters: number;
    readonly facts: number;
    readonly chapters: number;
    readonly acceptedBeats: number;
  };
  /** W5.5: sidebar badge counters. */
  readonly badges: {
    readonly pendingProposals: number;
  };
}

export function projectProgressView(snap: ProjectProgressSnapshot): ProjectProgressView {
  const counts = {
    characters: snap.characterCount,
    facts: snap.factCount,
    chapters: snap.chapterCount,
    acceptedBeats: snap.beatWithAcceptedProseCount,
  };
  const pendingProposalCount = snap.pendingProposalCount ?? 0;
  const artifactPublishedCount = snap.artifactPublishedCount ?? 0;
  const badges = { pendingProposals: pendingProposalCount };

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

  // Stage progression (full release-1 journey; publish wins, then review).
  let stage: ProjectProgressView['stage'];
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
  } else if (artifactPublishedCount > 0) {
    stage = 'publish';
    nextAction = { code: 'publish_artifact', hrefHint: 'publish' };
  } else if (pendingProposalCount > 0) {
    stage = 'review';
    nextAction = { code: 'close_chapter', hrefHint: 'selesaikan' };
  } else if (snap.beatWithAcceptedProseCount === 0) {
    stage = 'writing';
    nextAction = { code: 'write_beat', hrefHint: 'tulis' };
  } else {
    stage = 'writing';
    nextAction = { code: 'continue_writing', hrefHint: 'tulis' };
  }

  return { stage, blockers, nextAction, counts, badges };
}

/**
 * Intake sufficiency indicator (W5.5, deterministic — lesson C8). The count
 * comes from the persisted intake session signal_count (fields extracted by
 * the intake reply), never from a client-supplied value. Required = 3 story
 * signal fields; sufficiency flips the chat CTA to "Susun 3 Konsep".
 */
export const REQUIRED_INTAKE_SIGNALS = 3;

export interface IntakeSufficiencyInput {
  readonly collectedSignalCount: number;
}

export interface IntakeSufficiencyView {
  readonly collected: number;
  readonly required: number;
  readonly sufficient: boolean;
  readonly nextAction: {
    readonly code: 'compose_concepts' | 'continue_intake';
    readonly hrefHint: 'konsep' | 'chat';
  };
}

export function intakeSufficiencyView(input: IntakeSufficiencyInput): IntakeSufficiencyView {
  const collected = Number.isSafeInteger(input.collectedSignalCount)
    ? Math.max(0, input.collectedSignalCount)
    : 0;
  const sufficient = collected >= REQUIRED_INTAKE_SIGNALS;
  return Object.freeze({
    collected,
    required: REQUIRED_INTAKE_SIGNALS,
    sufficient,
    nextAction: sufficient
      ? { code: 'compose_concepts' as const, hrefHint: 'konsep' as const }
      : { code: 'continue_intake' as const, hrefHint: 'chat' as const },
  });
}
