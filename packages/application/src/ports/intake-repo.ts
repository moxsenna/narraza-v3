import type { IntakeMessageRecord, IntakeSessionRecord, JsonObject } from './types.js';

export interface IntakeSessionInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly status: string;
  readonly signalCount?: number;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface IntakeMessageInsertInput {
  readonly id: string;
  readonly projectId: string;
  readonly intakeSessionId: string;
  readonly role: string;
  readonly sequence: number;
  readonly content: string;
  readonly jobId?: string | null;
}

export interface IntakeRepo {
  insertSession(input: IntakeSessionInsertInput): Promise<IntakeSessionRecord>;
  findSessionByProject(projectId: string): Promise<IntakeSessionRecord | null>;
  nextMessageSequence(projectId: string, intakeSessionId: string): Promise<number>;
  insertMessage(input: IntakeMessageInsertInput): Promise<IntakeMessageRecord>;
  listMessages(projectId: string, intakeSessionId: string): Promise<readonly IntakeMessageRecord[]>;
}
