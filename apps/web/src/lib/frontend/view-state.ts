import type { CapabilityMode } from './capabilities';

export const STATE_AXIS_VALUES = {
  capability: ['REAL', 'PRESENTATION', 'DISABLED'],
  view: ['loading', 'ready', 'empty', 'error', 'stale'],
  mutation: ['idle', 'saving', 'saved', 'blocked', 'error'],
  quote: ['unavailable', 'quoted', 'expired'],
  job: ['none', 'queued', 'running', 'succeeded', 'failed', 'dead', 'cancelled'],
  artifact: ['none', 'candidate', 'accepted'],
  draft: ['clean', 'saving', 'saved', 'conflict', 'stale'],
  validation: ['not-run', 'running', 'ready', 'stale'],
  presentation: ['editor', 'comparison', 'preview'],
} as const;

export type ViewState = (typeof STATE_AXIS_VALUES.view)[number];
export type MutationState = (typeof STATE_AXIS_VALUES.mutation)[number];
export type QuoteState = (typeof STATE_AXIS_VALUES.quote)[number];
export type JobState = (typeof STATE_AXIS_VALUES.job)[number];
export type ArtifactState = (typeof STATE_AXIS_VALUES.artifact)[number];
export type DraftState = (typeof STATE_AXIS_VALUES.draft)[number];
export type ValidationState = (typeof STATE_AXIS_VALUES.validation)[number];
export type PresentationState = (typeof STATE_AXIS_VALUES.presentation)[number];

export type Recoverability = Readonly<{
  recoverable: boolean;
  retryKind?: 'same-read' | 'new-job' | 'request-new-quote' | 'manual-resolution';
}>;

export type OrthogonalViewState = Readonly<{
  capability: CapabilityMode;
  view: ViewState;
  mutation: MutationState;
  quote: QuoteState;
  job: JobState;
  artifact: ArtifactState;
  draft: DraftState;
  validation: ValidationState;
  presentation: PresentationState;
}>;
