import Link from 'next/link';

import type { CreditSummaryDisplayView } from '../../lib/frontend/credit-display';

/**
 * Header credit chip fed by the same CreditSummaryView snapshot contract as
 * /app/kredit (D6). The compact numeric variant keeps the 375px header
 * overflow-free while the labelled chip appears from sm upward.
 */
export function CreditChip({ credit }: { credit: CreditSummaryDisplayView }) {
  const tone = credit.lowBalance
    ? 'border-status-warning bg-status-warning-soft text-status-warning'
    : 'border-default bg-canvas text-secondary';

  return (
    <Link
      href="/app/kredit"
      aria-label={`Kredit tersedia ${credit.availableCredits}. Buka halaman kredit.`}
      data-testid="header-credit-chip"
      className={`ml-auto inline-flex min-h-11 items-center justify-center rounded-pill border px-3 text-sm font-bold tabular-nums sm:ml-0 sm:gap-1.5 sm:px-4 ${tone}`}
    >
      <span className="hidden sm:inline">Kredit</span>
      <span>{credit.availableCredits}</span>
      <span className="hidden sm:inline">kredit</span>
    </Link>
  );
}
