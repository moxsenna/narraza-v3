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
