import type { MissingJobReservationFundingModel } from '../ports/outbox-port.js';
import type { MissingJobReservationIncidentResult } from '../ports/outbox-port.js';

/**
 * Typed outcome for a terminal job whose funding model requires a reservation
 * but whose `reservationId` is null. The incident is durably recorded (or
 * replayed) before this value is returned; no ledger, allocation, or
 * reservation mutation ever happens for this shape.
 *
 * Lives in its own leaf module so port-layer result unions can reference it
 * without creating an application-service dependency cycle.
 */
export interface MissingReservationViolation {
  readonly kind: 'funding_model_violation';
  readonly reason: 'missing_reservation';
  readonly fundingModel: MissingJobReservationFundingModel;
  readonly incident: MissingJobReservationIncidentResult['kind'];
}

export type RecordMissingJobReservationOutcome =
  { readonly kind: 'not_bound' } | MissingReservationViolation;
