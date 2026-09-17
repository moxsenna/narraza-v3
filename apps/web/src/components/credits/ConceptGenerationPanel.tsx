'use client';

import { useActionState, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import { isNonterminalPhase } from '../../lib/frontend/job-phase';
import {
  cancelConceptGenerationJobAction,
  confirmConceptGenerationQuoteAction,
  getConceptJobStateAction,
  requestConceptGenerationQuoteAction,
  type ConceptQuoteConfirmState,
  type ConceptQuoteRequestState,
} from '../../server/domain/concept-generation-actions';
import { Button } from '../primitives';
import { ConceptJobPanel } from './ConceptJobPanel';
import { CreditQuoteCard } from './CreditQuoteCard';

function StartSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Meminta penawaran…' : 'Susun 3 konsep'}
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

const ACTION_TITLE = 'Susun 3 konsep';

function StartCard({
  projectId,
  failureMessage,
  requestQuoteAction,
}: {
  projectId: string;
  failureMessage: string | null;
  requestQuoteAction: ComponentProps<'form'>['action'];
}) {
  return (
    <section
      aria-label={ACTION_TITLE}
      className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6"
      data-testid="concept-generation-start"
    >
      <h3 className="text-base font-bold text-text-primary">Susun 3 konsep</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Narra menyusun tiga arah cerita dari sinyal yang terkumpul di chat. Kamu akan melihat
        perkiraan biaya maksimal dan bisa membatalkan sebelum dan selama proses berjalan.
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
        <StartSubmitButton />
      </form>
    </section>
  );
}

export function ConceptGenerationPanel({
  projectId,
  initialJobRef,
  initialJob,
}: {
  projectId: string;
  initialJobRef: string | null;
  initialJob: JobPublicView | null;
}) {
  const [quoteState, requestQuoteAction] = useActionState<
    ConceptQuoteRequestState | null,
    FormData
  >(requestConceptGenerationQuoteAction, null);
  const [confirmState, confirmAction] = useActionState<ConceptQuoteConfirmState | null, FormData>(
    confirmConceptGenerationQuoteAction,
    null,
  );

  if (initialJobRef && initialJob) {
    const panel = (
      <ConceptJobPanel
        projectId={projectId}
        initialJobRef={initialJobRef}
        initialJob={initialJob}
        recovered={initialJob.recovered}
        stateAction={getConceptJobStateAction}
        cancelAction={cancelConceptGenerationJobAction}
      />
    );
    if (!isNonterminalPhase(initialJob.phase)) {
      return (
        <div className="space-y-4">
          {panel}
          <StartCard
            projectId={projectId}
            failureMessage={null}
            requestQuoteAction={requestQuoteAction}
          />
        </div>
      );
    }
    return panel;
  }

  if (confirmState?.kind === 'job_started' || confirmState?.kind === 'active_job') {
    return (
      <ConceptJobPanel
        projectId={projectId}
        initialJobRef={confirmState.jobRef}
        initialJob={confirmState.job}
        recovered={false}
        stateAction={getConceptJobStateAction}
        cancelAction={cancelConceptGenerationJobAction}
      />
    );
  }

  if (quoteState?.kind === 'active_job') {
    return (
      <ConceptJobPanel
        projectId={projectId}
        initialJobRef={quoteState.jobRef}
        initialJob={quoteState.job}
        recovered={true}
        stateAction={getConceptJobStateAction}
        cancelAction={cancelConceptGenerationJobAction}
      />
    );
  }

  if (quoteState?.kind === 'quoted') {
    const { quote } = quoteState;
    const insufficient = quote.availableCredits < quote.maxCredits;
    return (
      <CreditQuoteCard
        actionTitle={ACTION_TITLE}
        state={insufficient ? 'insufficient' : 'quoted'}
        maxCredits={quote.maxCredits}
        availableCredits={quote.availableCredits}
        footer={
          <form action={confirmAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="quoteId" value={quote.quoteId} />
            <ConfirmSubmitButton disabled={insufficient} />
          </form>
        }
      />
    );
  }

  if (confirmState && 'message' in confirmState) {
    return (
      <StartCard
        projectId={projectId}
        failureMessage={confirmState.message}
        requestQuoteAction={requestQuoteAction}
      />
    );
  }

  return (
    <StartCard
      projectId={projectId}
      failureMessage={
        quoteState?.kind === 'ambiguous'
          ? 'Terjadi ketidaksesuaian proses. Muat ulang halaman untuk memulihkan kondisi terbaru.'
          : quoteState?.kind === 'error'
            ? quoteState.message
            : null
      }
      requestQuoteAction={requestQuoteAction}
    />
  );
}
