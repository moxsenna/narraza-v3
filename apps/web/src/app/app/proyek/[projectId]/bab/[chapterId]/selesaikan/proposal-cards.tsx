'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptProposalAction,
  rejectProposalAction,
  type ProposalActionState,
} from '../../../../../../../server/domain/proposal-actions';
import type { PendingProposalView } from '@narraza/application';

const initial: ProposalActionState = { ok: false };

type ProposalCardRow = PendingProposalView & { readonly sourceLabel: string };

function ProposalCard({ row, projectId }: { row: ProposalCardRow; projectId: string }) {
  const router = useRouter();
  const [acceptState, acceptFormAction, acceptPending] = useActionState(
    acceptProposalAction,
    initial,
  );
  const [rejectState, rejectFormAction, rejectPending] = useActionState(
    rejectProposalAction,
    initial,
  );

  useEffect(() => {
    if (acceptState.ok || rejectState.ok) router.refresh();
  }, [acceptState, rejectState, router]);

  const { view } = row;
  const acceptError = acceptState.ok ? null : acceptState.message;
  const rejectError = rejectState.ok ? null : rejectState.message;
  const canDecide = view.availableActions.includes('accept');

  return (
    <article
      className="rounded-2xl border border-border-default bg-surface p-5"
      data-testid="proposal-card"
      data-risk={view.risk}
      data-status={view.status}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold text-text-secondary">
          {row.sourceLabel}
        </span>
        {view.highRisk && (
          <span
            className="rounded-full bg-status-danger-soft px-2.5 py-0.5 text-xs font-bold text-status-danger"
            data-testid="high-risk-badge"
          >
            Berisiko tinggi
          </span>
        )}
        {view.status === 'needs_revalidation' && (
          <span className="rounded-full bg-status-warning-soft px-2.5 py-0.5 text-xs font-bold text-text-primary">
            Perlu ditinjau ulang
          </span>
        )}
      </header>

      {view.proseExcerpt && (
        <p className="mb-3 line-clamp-4 whitespace-pre-wrap font-serif text-sm leading-6 text-text-primary">
          {view.proseExcerpt}
        </p>
      )}

      <ul className="mb-4 space-y-1" data-testid="proposal-ops">
        {view.operations.map((op) => (
          <li key={`${op.kind}-${op.label}`} className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{op.label}</span> — {op.impact}{' '}
            <span className="text-xs text-text-muted">({op.risk})</span>
          </li>
        ))}
      </ul>

      {canDecide ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <form action={acceptFormAction} className="flex-1">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="proposalId" value={view.proposalId} />
            <input type="hidden" name="baseCanonicalVersion" value={row.baseCanonicalVersion} />
            <input type="hidden" name="highRisk" value={view.highRisk ? '1' : '0'} />
            {view.highRisk && (
              <label className="mb-2 block text-sm font-medium text-text-primary">
                Ketik &quot;jadikan resmi&quot; untuk konfirmasi kedua
                <input
                  type="text"
                  name="confirmPhrase"
                  required
                  className="mt-1 w-full rounded-lg border border-border-default bg-canvas px-3 py-2 text-sm text-text-primary"
                  data-testid="high-risk-confirm"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={acceptPending}
              className="w-full rounded-xl bg-interactive-primary px-4 py-2.5 text-sm font-bold text-interactive-primary-foreground disabled:opacity-50 sm:w-auto"
              data-testid="accept-proposal"
            >
              Terapkan &amp; jadikan resmi
            </button>
            {acceptError && (
              <p className="mt-2 text-sm text-status-danger" data-testid="accept-error">
                {acceptError}
              </p>
            )}
          </form>
          <form action={rejectFormAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="proposalId" value={view.proposalId} />
            <button
              type="submit"
              disabled={rejectPending}
              className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm font-semibold text-text-secondary disabled:opacity-50 sm:w-auto"
              data-testid="reject-proposal"
            >
              Tolak
            </button>
            {rejectError && (
              <p className="mt-2 text-sm text-status-danger" data-testid="reject-error">
                {rejectError}
              </p>
            )}
          </form>
        </div>
      ) : (
        <p className="text-sm text-text-muted" data-testid="proposal-no-actions">
          Tidak ada aksi tersedia untuk usulan ini.
        </p>
      )}
    </article>
  );
}

export function ProposalCards({
  rows,
  projectId,
}: {
  rows: readonly ProposalCardRow[];
  projectId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary" data-testid="proposals-empty">
        Belum ada usulan yang menunggu keputusan.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <ProposalCard key={row.view.proposalId} row={row} projectId={projectId} />
      ))}
    </div>
  );
}
