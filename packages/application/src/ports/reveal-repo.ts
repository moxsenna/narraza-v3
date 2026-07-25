import type { JsonObject, RevealBreadcrumbRecord, RevealRecord } from './types.js';

export interface RevealInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly factId: string;
  readonly chapterId: string;
  readonly beatId: string | null;
  readonly targetSequence: number;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface RevealUpdateInput {
  readonly projectId: string;
  readonly id: string;
  readonly chapterId: string;
  readonly beatId: string | null;
  readonly targetSequence: number;
  readonly payload: JsonObject;
  readonly expectedRevision: number | null;
}

export interface BreadcrumbInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly revealId: string;
  readonly chapterId: string;
  readonly beatId: string | null;
  readonly sequence: number;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface RevealRepo {
  insertReveal(input: RevealInsertInput): Promise<RevealRecord>;
  updateReveal(input: RevealUpdateInput): Promise<RevealRecord | null>;
  findReveal(projectId: string, id: string): Promise<RevealRecord | null>;
  insertBreadcrumb(input: BreadcrumbInsertInput): Promise<RevealBreadcrumbRecord>;
  listByProject(projectId: string): Promise<{
    readonly reveals: readonly RevealRecord[];
    readonly breadcrumbs: readonly RevealBreadcrumbRecord[];
  }>;
}
