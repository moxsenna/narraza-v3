import 'server-only';

import { type CreditSummaryView } from '@narraza/application';
import { creditSummaryDisplay, type CreditSummaryDisplayView } from '../frontend/credit-display';

/**
 * Server-side mapping of the authoritative CreditSummaryView (D6).
 *
 * CreditSummaryView is ALREADY expressed in whole credits: the application
 * layer applies the approved D6 conversion (floor for available, ceil for
 * held/reconciling) inside computeCreditSummaryView. This mapper therefore
 * only widens bigint credits to the display type and must never re-apply a
 * micro-IDR conversion, which would divide an already-converted value again.
 */
export function toCreditSummaryDisplay(view: CreditSummaryView): CreditSummaryDisplayView {
  return creditSummaryDisplay(Number(view.available), Number(view.held), Number(view.reconciling));
}
