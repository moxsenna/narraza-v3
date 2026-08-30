'use client';

import { useActionState, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import { isNonterminalPhase } from '../../lib/frontend/job-phase';
import {
  cancelSceneGenerationJobAction,
  confirmSceneGenerationQuoteAction,
  getChapterJobStateAction,
  requestSceneGenerationQuoteAction,
  type QuoteConfirmState,
  type QuoteRequestState,
} from '../../server/domain/generation-actions';
import { Button } from '../primitives';
import { CreditQuoteCard, type CreditQuoteCardState } from './CreditQuoteCard';
import { JobPhasePanel } from './JobPhasePanel';

function StartSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Meminta penawaran…' : 'Buat adegan'}
    </Button>
  );
}

function ConfirmSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? 'Memproses…' : 'Konfirmasi & mulai'}
    </Button>
  );
}

function RequoteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Meminta penawaran…' : 'Minta penawaran baru'}
    </Button>
  );
}

const ACTION_TITLE = 'Buat adegan';

function StartCard({
  projectId,
  chapterId,
  failureMessage,
  requestQuoteAction,
}: {
  projectId: string;
  chapterId: string;
  failureMessage: string | null;
  requestQuoteAction: ComponentProps<'form'>['action'];
}) {
  return (
    <section
      aria-label={ACTION_TITLE}
      className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6"
      data-testid="scene-generation-start"
    >
      <h3 className="text-base font-bold text-text-primary">Buat adegan</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Adegan diproses sebagai proses terjadwal. Kamu akan melihat perkiraan biaya maksimal dan
        bisa membatalkan sebelum dan selama proses berjalan.
      </p>
      {failureMessage && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
        >
          {failureMessage}
        </p>
      )}
      <form action={requestQuoteAction} className="mt-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="chapterId" value={chapterId} />
        <StartSubmitButton />
      </form>
    </section>
  );
}

export function SceneGenerationPanel({
  projectId,
  chapterId,
  initialJobRef,
  initialJob,
}: {
  projectId: string;
  chapterId: string;
  initialJobRef: string | null;
  initialJob: JobPublicView | null;
}) {
  const [quoteState, requestQuoteAction] = useActionState<QuoteRequestState | null, FormData>(
    requestSceneGenerationQuoteAction,
    null,
  );
  const [confirmState, confirmAction] = useActionState<QuoteConfirmState | null, FormData>(
    confirmSceneGenerationQuoteAction,
    null,
  );

  if (initialJobRef && initialJob) {
    const panel = (
      <JobPhasePanel
        projectId={projectId}
        chapterId={chapterId}
        initialJobRef={initialJobRef}
        initialJob={initialJob}
        recovered={initialJob.recovered}
        stateAction={getChapterJobStateAction}
        cancelAction={cancelSceneGenerationJobAction}
      />
    );
    // A finished job is immutable: keep its truthful outcome visible and still
    // offer the start flow for the next run.
    if (!isNonterminalPhase(initialJob.phase)) {
      return (
        <div className="space-y-4">
          {panel}
          <StartCard
            projectId={projectId}
            chapterId={chapterId}
            failureMessage={null}
            requestQuoteAction={requestQuoteAction}
          />
        </div>
      );
    }
    return panel;
  }

  if (quoteState?.kind === 'active_job') {
    return (
      <JobPhasePanel
        projectId={projectId}
        chapterId={chapterId}
        initialJobRef={quoteState.jobRef}
        initialJob={quoteState.job}
        recovered
        stateAction={getChapterJobStateAction}
        cancelAction={cancelSceneGenerationJobAction}
      />
    );
  }

  if (confirmState?.kind === 'job_started') {
    return (
      <JobPhasePanel
        projectId={projectId}
        chapterId={chapterId}
        initialJobRef={confirmState.jobRef}
        initialJob={confirmState.job}
        recovered={false}
        stateAction={getChapterJobStateAction}
        cancelAction={cancelSceneGenerationJobAction}
      />
    );
  }

  const quote = quoteState?.kind === 'quoted' ? quoteState.quote : null;

  if (!quote) {
    const failureMessage =
      quoteState?.kind === 'ambiguous'
        ? 'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.'
        : quoteState?.kind === 'error'
          ? quoteState.message
          : null;
    return (
      <StartCard
        projectId={projectId}
        chapterId={chapterId}
        failureMessage={failureMessage}
        requestQuoteAction={requestQuoteAction}
      />
    );
  }

  const expiredMessage = confirmState?.kind === 'quote_expired' ? confirmState.message : undefined;
  const insufficientMessage =
    confirmState?.kind === 'insufficient_credit' ? confirmState.message : undefined;
  const errorMessage =
    confirmState?.kind === 'stale_plan' ||
    confirmState?.kind === 'already_consumed' ||
    confirmState?.kind === 'error'
      ? confirmState.message
      : undefined;

  const cardState: CreditQuoteCardState = expiredMessage
    ? 'expired'
    : insufficientMessage
      ? 'insufficient'
      : errorMessage
        ? 'error'
        : 'quoted';
  const cardMessage = expiredMessage ?? insufficientMessage ?? errorMessage;

  const needsRequote = cardState !== 'quoted';
  const confirmDisabled = quote.availableCredits < quote.maxCredits;

  return (
    <CreditQuoteCard
      actionTitle={ACTION_TITLE}
      state={cardState}
      maxCredits={quote.maxCredits}
      availableCredits={quote.availableCredits}
      message={cardMessage}
      footer={
        <div className="space-y-3">
          {!needsRequote && (
            <form action={confirmAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="chapterId" value={chapterId} />
              <input type="hidden" name="quoteId" value={quote.quoteId} />
              <ConfirmSubmitButton disabled={confirmDisabled} />
            </form>
          )}
          {needsRequote && (
            <form action={requestQuoteAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="chapterId" value={chapterId} />
              <RequoteSubmitButton />
            </form>
          )}
        </div>
      }
    />
  );
}
