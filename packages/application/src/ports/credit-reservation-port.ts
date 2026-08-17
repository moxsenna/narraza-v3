import type { CreditReservationRecord } from './types.js';

export interface CreateReservationInput {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly quoteId: string;
  readonly confirmationRequestId: string;
  readonly reservedMicroIdr: bigint;
  readonly exposureMicroIdr: bigint;
}

export type CreateReservationResult =
  | { readonly kind: 'created'; readonly reservation: CreditReservationRecord }
  | { readonly kind: 'conflict' };

export interface CreditReservationPort {
  // Task 6: Find replay by confirmation request ID (unique constraint ensures single record)
  findReplayByConfirmationRequestId(
    confirmationRequestId: string
  ): Promise<CreditReservationRecord | null>;
  
  // Task 6: Create open USER_PAID reservation
  create(input: CreateReservationInput): Promise<CreateReservationResult>;
}
