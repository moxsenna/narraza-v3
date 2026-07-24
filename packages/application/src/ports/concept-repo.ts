import type { JsonObject } from './types.js';

export interface ConceptRecord {
  readonly id: string;
  readonly projectId: string;
  readonly conceptSetId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly synopsis: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface ConceptSetRecord {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly dependencyHash: string;
  readonly schemaVersion: number;
  readonly payload: JsonObject;
}

export interface ConceptSetInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly dependencyHash: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface ConceptInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly conceptSetId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly synopsis: string;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface ConceptRepo {
  insertSet(input: ConceptSetInsertInput): Promise<ConceptSetRecord>;
  insertConcept(input: ConceptInsertInput): Promise<ConceptRecord>;
  findConcept(projectId: string, conceptId: string): Promise<ConceptRecord | null>;
  findSet(projectId: string, conceptSetId: string): Promise<ConceptSetRecord | null>;
  markSetSelected(projectId: string, conceptSetId: string): Promise<ConceptSetRecord | null>;
}
