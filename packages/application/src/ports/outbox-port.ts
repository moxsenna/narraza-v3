import type { JsonObject } from './types.js';

export interface OutboxAppendInput {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly dedupeKey: string;
  readonly occurredAt: Date;
  readonly schemaVersion?: number;
  readonly payload: JsonObject;
}

export interface OutboxPort {
  append(input: OutboxAppendInput): Promise<void>;
}
