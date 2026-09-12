export interface ProseWorkingDraftRecord {
  readonly id: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly userId: string;
  readonly revision: number;
  readonly content: string;
  readonly contentHash: string;
}

export interface ProseVersionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly sourceCandidateId: string | null;
  readonly status: string;
  readonly revision: number;
  readonly content: string;
  readonly contentHash: string;
}

export interface ProseDraftUpsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly userId: string;
  readonly content: string;
  readonly contentHash: string;
}

export interface ProseVersionInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly beatId: string;
  readonly sourceCandidateId: string | null;
  readonly status: string;
  readonly revision: number;
  readonly content: string;
  readonly contentHash: string;
}

export interface ProseDraftRepo {
  findActive(
    projectId: string,
    userId: string,
    beatId: string,
  ): Promise<ProseWorkingDraftRecord | null>;
  insert(input: ProseDraftUpsertInput): Promise<ProseWorkingDraftRecord>;
  updateContent(
    projectId: string,
    id: string,
    input: { content: string; contentHash: string; expectedRevision: number },
  ): Promise<ProseWorkingDraftRecord | null>;
  softDelete(projectId: string, id: string): Promise<void>;
}

export interface ProseVersionRepo {
  insert(input: ProseVersionInsertInput): Promise<ProseVersionRecord>;
  findById(projectId: string, id: string): Promise<ProseVersionRecord | null>;
  maxRevision(projectId: string, beatId: string): Promise<number | null>;
}
