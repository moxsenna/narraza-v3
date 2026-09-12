/**
 * Presentation-only shape of the authoritative CreditSummaryView (D6).
 * Micro-IDR to credit conversion happens in the server mapper through the
 * approved application helpers (floor for available, ceil for held and
 * reconciling); this module owns only the display threshold policy.
 */
export type CreditSummaryDisplayView = Readonly<{
  availableCredits: number;
  heldCredits: number;
  reconcilingCredits: number;
  lowBalance: boolean;
}>;

export const LOW_BALANCE_CREDIT_THRESHOLD = 10;

export function creditSummaryDisplay(
  availableCredits: number,
  heldCredits: number,
  reconcilingCredits: number,
): CreditSummaryDisplayView {
  return Object.freeze({
    availableCredits,
    heldCredits,
    reconcilingCredits,
    lowBalance: availableCredits < LOW_BALANCE_CREDIT_THRESHOLD,
  });
}
