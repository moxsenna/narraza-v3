'use server';

export type CapabilityMode = 'REAL' | 'PRESENTATION' | 'DISABLED';

export type ResolvedCapability = Readonly<{
  readonly mode: CapabilityMode;
  readonly environment: 'development' | 'staging' | 'production';
  readonly resolvedAt: string; // ISO timestamp for audit trails
  readonly validatorPassed: boolean;
}>;

export type CapabilityResult<T = void> = 
  | { success: true; data: T; resolved: ResolvedCapability }
  | { success: false; error: { code: string; message: string } };

export type ProjectContextResult =
  | { kind: 'resolved'; projectId: string; href: string }
  | { kind: 'choose'; projects: ProjectChoiceView[] }
  | {
      kind: 'blocked';
      reasonCode: 'no_project' | 'no_eligible_project';
      createProjectHref: string;
    };

export type ProjectChoiceView = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly outlineCount: number;
}>;

// Chapter context types (for PR4 reference, not used in PR3)
export type ChapterBlockReason = 
  | 'no_chapter' 
  | 'foundation_not_locked' 
  | 'no_writable_chapter' 
  | 'chapter_unavailable';

export type ChapterChoiceView = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly ordinal?: number;
}>;

export type ChapterContextResult =
  | { kind: 'resolved'; projectId: string; chapterId: string; href: string }
  | { kind: 'choose'; chapters: ChapterChoiceView[] }
  | {
      kind: 'blocked';
      reasonCode: ChapterBlockReason;
      outlineHref: string;
    };
