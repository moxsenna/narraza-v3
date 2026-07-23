import type { JsonObject } from './types.js';

export interface AuditAppendInput {
  readonly userId: string | null;
  readonly action: string;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly metadata?: JsonObject | null;
}

export interface AuditPort {
  append(input: AuditAppendInput): Promise<void>;
}
