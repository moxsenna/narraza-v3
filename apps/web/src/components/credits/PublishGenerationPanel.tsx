'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import {
  cancelPublishGenerationJobAction,
  confirmPublishGenerationQuoteAction,
  getPublishJobStateAction,
  requestPublishGenerationQuoteAction,
  type PublishQuoteConfirmState,
  type PublishQuoteRequestState,
} from '../../server/domain/publish-generation-actions';
import { Button } from '../primitives';
import { ConceptJobPanel } from './ConceptJobPanel';
import { CreditQuoteCard } from './CreditQuoteCard';

function StartSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Meminta penawaran…' : 'Buat paket publish'}
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

const ACTION_TITLE = 'Buat paket publish';
const PANEL_LABEL = 'Status pembuatan paket';
const RECOVERED_NOTE =
  'Ada proses pembuatan paket yang masih berjalan. Statusnya dipulihkan dari server.';
const ACTIVE_NOTE =
  'Paket disusun di server. Hasilnya menjadi usulan, tidak mengubah cerita resmi.';

function JobPanel({
  projectId,
  jobRef,
  job,
  recovered,
}: {
  projectId: string;
  jobRef: string;
  job: JobPublicView;
  recovered: boolean;
}) {
  return (
    <ConceptJobPanel
      projectId={projectId}
      initialJobRef={jobRef}
      initialJob={job}
      recovered={recovered}
      stateAction={getPublishJobStateAction}
      cancelAction={cancelPublishGenerationJobAction}
      panelLabel={PANEL_LABEL}
      recoveredNote={RECOVERED_NOTE}
      activeNote={ACTIVE_NOTE}
    />
  );
}

export function PublishGenerationPanel({
  projectId,
  beatId,
  initialJobRef,
  initialJob,
}: {
  projectId: string;
  beatId: string;
  initialJobRef: string | null;
  initialJob: JobPublicView | null;
}) {
  const [quoteState, requestQuoteAction] = useActionState<
    PublishQuoteRequestState | null,
    FormData
  >(requestPublishGenerationQuoteAction, null);
  const [confirmState, confirmAction] = useActionState<PublishQuoteConfirmState | null, FormData>(
    confirmPublishGenerationQuoteAction,
    null,
  );

  if (initialJobRef && initialJob) {
    return (
      <div className="space-y-4">
        <JobPanel
          projectId={projectId}
          jobRef={initialJobRef}
          job={initialJob}
          recovered={initialJob.recovered}
        />
      </div>
    );
  }

  if (confirmState?.kind === 'job_started' || confirmState?.kind === 'active_job') {
    return (
      <JobPanel
        projectId={projectId}
        jobRef={confirmState.jobRef}
        job={confirmState.job}
        recovered={false}
      />
    );
  }

  if (quoteState?.kind === 'active_job') {
    return (
      <JobPanel
        projectId={projectId}
        jobRef={quoteState.jobRef}
        job={quoteState.job}
        recovered={true}
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

  return (
    <section
      aria-label={ACTION_TITLE}
      className="rounded-2xl border border-border-default bg-surface p-5 sm:p-6"
      data-testid="publish-generation-start"
    >
      <h3 className="text-base font-bold text-text-primary">Buat paket publish</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Narra menyusun teaser, caption, dan tag dari naskah resmi adegan ini. Kamu akan melihat
        perkiraan biaya maksimal dulu; paket yang jadi tetap usulan sampai kamu terima.
      </p>
      {(quoteState?.kind === 'error' || quoteState?.kind === 'ambiguous') && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
        >
          {quoteState.kind === 'error'
            ? quoteState.message
            : 'Terjadi ketidaksesuaian proses. Muat ulang halaman.'}
        </p>
      )}
      {confirmState && 'message' in confirmState && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-status-danger-soft p-3 text-sm font-semibold text-status-danger"
        >
          {confirmState.message}
        </p>
      )}
      <form action={requestQuoteAction} className="mt-4">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="beatId" value={beatId} />
        <StartSubmitButton />
      </form>
    </section>
  );
}
