import 'server-only';

import type { PreviewPresentationFixture } from './presentation-fixtures';
import type { PreviewScenario } from './scenario-registry';

export type PreviewPresentation =
  | Readonly<{
      view: 'kredit';
      actionsDisabled: true;
    }>
  | Readonly<{
      view: 'tulis';
      projectTitle: string;
      state: 'choose';
      choices: readonly Readonly<{ title: string; ordinal?: number }>[];
      actionsDisabled: true;
    }>
  | Readonly<{
      view: 'tulis';
      projectTitle: string;
      state: 'OUTLINE_REQUIRED' | 'NO_CHAPTER_AVAILABLE';
      actionsDisabled: true;
    }>;

export function mapPreviewScenario(
  scenario: PreviewScenario,
  fixture: PreviewPresentationFixture,
): PreviewPresentation {
  if (scenario.key === 'kredit-unavailable' && fixture.kind === 'kredit') {
    return { view: 'kredit', actionsDisabled: true };
  }

  if (fixture.kind !== 'tulis') {
    throw new Error('Preview scenario fixture mismatch');
  }

  if (fixture.state === 'choose') {
    return {
      view: 'tulis',
      projectTitle: fixture.projectTitle,
      state: 'choose',
      choices: fixture.choices.map((choice) => ({
        title: choice.title,
        ...(choice.ordinal === undefined ? {} : { ordinal: choice.ordinal }),
      })),
      actionsDisabled: true,
    };
  }

  return {
    view: 'tulis',
    projectTitle: fixture.projectTitle,
    state: fixture.state,
    actionsDisabled: true,
  };
}
