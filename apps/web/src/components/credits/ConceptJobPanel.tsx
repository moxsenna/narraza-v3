'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  JOB_PHASE_LABELS,
  isNonterminalPhase,
  jobOutcomeMessage,
  type JobPublicView,
} from '../../lib/frontend/job-phase';
import { ConfirmationDialog } from '../composites/ConfirmationDialog';
import { Button } from '../primitives';

/** Structural loop-state contract shared by concept/repair/publish panels. */
export type PaidJobStateResult =
  | { readonly kind: 'active'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'terminal'; readonly jobRef: string; readonly job: JobPublicView }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'error'; readonly message: string };

export type PaidJobCancelState =
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'cancel_requested'; readonly message: string }
  | { readonly kind: 'not_active'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** D12: initial UI poll 2,5s with backoff up to 10s while a nonterminal job exists. */
const INITIAL_POLL_MS = 2500;
const MAX_POLL_MS = 10000;

export function ConceptJobPanel({
  projectId,
  initialJobRef,
  initialJob,
  recovered,
  stateAction,
  cancelAction,
  panelLabel = 'Status penyusunan konsep',
  recoveredNote = 'Ada proses penyusunan konsep yang masih berjalan. Statusnya dipulihkan dari server.',
  activeNote = 'Konsep disusun di server. Kamu bisa meninggalkan halaman ini dan kembali lagi; statusnya dipulihkan otomatis.',
}: {
  projectId: string;
  initialJobRef: string;
  initialJob: JobPublicView;
  recovered: boolean;
  stateAction: (projectId: string, jobRef: string | null) => Promise<PaidJobStateResult>;
  cancelAction: (
    prev: PaidJobCancelState | null,
    formData: FormData,
  ) => Promise<PaidJobCancelState>;
  panelLabel?: string;
  recoveredNote?: string;
  activeNote?: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobPublicView>(initialJob);
  const [jobRef, setJobRef] = useState(initialJobRef);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [stickyMessage, setStickyMessage] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const pollRef = useRef<{ cancelled: boolean; timer?: ReturnType<typeof setTimeout> }>({
    cancelled: false,
  });

  const nonterminal = isNonterminalPhase(job.phase);

  useEffect(() => {
    if (!nonterminal) return;
    const poll = pollRef.current;
    poll.cancelled = false;
    let delay = INITIAL_POLL_MS;

    const tick = async () => {
      if (poll.cancelled) return;
      try {
        const result = await stateAction(projectId, jobRef);
        if (poll.cancelled) return;
        if (result.kind === 'active' || result.kind === 'terminal') {
          setConnectionIssue(false);
          setJob(result.job);
          setJobRef(result.jobRef);
          if (result.kind === 'terminal') {
            router.refresh();
            return;
          }
        } else if (result.kind === 'none') {
          setConnectionIssue(false);
          setStickyMessage(
            'Status proses tidak dapat dimuat. Muat ulang halaman untuk kondisi terbaru.',
          );
          return;
        } else if (result.kind === 'ambiguous') {
          setConnectionIssue(false);
          setStickyMessage(
            'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.',
          );
          return;
        } else {
          setConnectionIssue(true);
        }
      } catch {
        if (!poll.cancelled) setConnectionIssue(true);
      }
      if (!poll.cancelled) {
        poll.timer = setTimeout(tick, delay);
        delay = Math.min(delay * 1.5, MAX_POLL_MS);
      }
    };

    poll.timer = setTimeout(tick, delay);
    return () => {
      poll.cancelled = true;
      if (poll.timer) clearTimeout(poll.timer);
    };
  }, [jobRef, nonterminal, projectId, stateAction, router]);

  const handleCancelConfirm = useCallback(async () => {
    setCancelPending(true);
    try {
      const formData = new FormData();
      formData.set('projectId', projectId);
      const result = await cancelAction(null, formData);
      if (result.kind === 'cancelled' || result.kind === 'cancel_requested') {
        setCancelNotice(result.message);
        const latest = await stateAction(projectId, jobRef);
        if (latest.kind === 'active' || latest.kind === 'terminal') {
          setJob(latest.job);
          setJobRef(latest.jobRef);
          if (latest.kind === 'terminal') router.refresh();
        }
      } else {
        setCancelNotice(result.message);
      }
    } finally {
      setCancelPending(false);
      setCancelOpen(false);
    }
  }, [cancelAction, jobRef, projectId, router, stateAction]);

  const outcome = jobOutcomeMessage(job);

  return (
    <section
      aria-label={panelLabel}
      className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6"
      data-testid="job-phase-panel"
    >
      <div aria-live="polite">
        {recovered && nonterminal && (
          <p className="mb-3 rounded-xl bg-status-info-soft p-3 text-sm font-semibold text-status-info">
            {recoveredNote}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={
              nonterminal
                ? 'size-3 animate-pulse rounded-pill bg-action-primary'
                : job.phase === 'succeeded'
                  ? 'size-3 rounded-pill bg-status-success'
                  : 'size-3 rounded-pill bg-status-danger'
            }
          />
          <p className="text-base font-bold text-text-primary">{JOB_PHASE_LABELS[job.phase]}</p>
        </div>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {nonterminal ? activeNote : (outcome ?? '')}
        </p>
        {job.cancelRequested && nonterminal && (
          <p className="mt-2 text-sm font-semibold text-status-warning">
            Pembatalan diminta. Proses akan berhenti sebentar lagi.
          </p>
        )}
        {cancelNotice && (
          <p className="mt-2 text-sm font-semibold text-text-secondary">{cancelNotice}</p>
        )}
        {connectionIssue && nonterminal && (
          <p className="mt-2 text-sm font-semibold text-status-warning">
            Koneksi terputus sementara. Status akan dicoba lagi otomatis.
          </p>
        )}
        {stickyMessage && (
          <p role="alert" className="mt-2 text-sm font-semibold text-status-danger">
            {stickyMessage}
          </p>
        )}
      </div>

      {nonterminal && !job.cancelRequested && (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCancelOpen(true)}
            disabled={cancelPending}
          >
            Batalkan proses
          </Button>
        </div>
      )}

      <ConfirmationDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Batalkan proses ini?"
        description={
          job.phase === 'queued'
            ? 'Proses masih menunggu giliran. Pembatalan langsung mengembalikan kredit yang ditahan.'
            : 'Proses sedang berjalan. Permintaan pembatalan akan menghentikan proses, dan kredit yang ditahan dikembalikan setelah proses berhenti.'
        }
        confirmLabel="Ya, batalkan"
        destructive
        onConfirm={handleCancelConfirm}
      />
    </section>
  );
}
