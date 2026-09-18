'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { JobPublicView } from '../../lib/frontend/job-phase';
import {
  cancelRepairGenerationJobAction,
  confirmRepairGenerationQuoteAction,
  getRepairJobStateAction,
  requestRepairGenerationQuoteAction,
  type RepairQuoteConfirmState,
  type RepairQuoteRequestState,
} from '../../server/domain/repair-generation-actions';
import { Button } from '../primitives';
import { ConceptJobPanel } from './ConceptJobPanel';
import { CreditQuoteCard } from './CreditQuoteCard';

function StartSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Meminta penawaran…' : 'Minta perbaikan'}
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

const ACTION_TITLE = 'Perbaikan aman';

export function RepairPanel({
  projectId,
  proseVersionId,
  initialJobRef,
  initialJob,
}: {
  projectId: string;
  proseVersionId: string;
  initialJobRef: string | null;
  initialJob: JobPublicView | null;
}) {
  const [quoteState, requestQuoteAction] = useActionState<RepairQuoteRequestState | null, FormData>(
    requestRepairGenerationQuoteAction,
    null,
  );
  const [confirmState, confirmAction] = useActionState<RepairQuoteConfirmState | null, FormData>(
    confirmRepairGenerationQuoteAction,
    null,
  );

  if (initialJobRef && initialJob) {
    return (
      <ConceptJobPanel
        projectId={projectId}
        initialJobRef={initialJobRef}
        initialJob={initialJob}
        recovered={initialJob.recovered}
        stateAction={getRepairJobStateAction}
        cancelAction={cancelRepairGenerationJobAction}
        panelLabel="Status perbaikan aman"
        recoveredNote="Ada proses perbaikan yang masih berjalan. Statusnya dipulihkan dari server."
        activeNote="Perbaikan berjalan di server. Hasilnya menjadi versi baru, tidak langsung resmi."
      />
    );
  }

  if (confirmState?.kind === 'job_started' || confirmState?.kind === 'active_job') {
    return (
      <ConceptJobPanel
        projectId={projectId}
        initialJobRef={confirmState.jobRef}
        initialJob={confirmState.job}
        recovered={false}
        stateAction={getRepairJobStateAction}
        cancelAction={cancelRepairGenerationJobAction}
        panelLabel="Status perbaikan aman"
        recoveredNote="Ada proses perbaikan yang masih berjalan. Statusnya dipulihkan dari server."
        activeNote="Perbaikan berjalan di server. Hasilnya menjadi versi baru, tidak langsung resmi."
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
        stateAction={getRepairJobStateAction}
        cancelAction={cancelRepairGenerationJobAction}
        panelLabel="Status perbaikan aman"
        recoveredNote="Ada proses perbaikan yang masih berjalan. Statusnya dipulihkan dari server."
        activeNote="Perbaikan berjalan di server. Hasilnya menjadi versi baru, tidak langsung resmi."
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
      data-testid="repair-generation-start"
    >
      <h3 className="text-base font-bold text-text-primary">Perbaikan aman</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        Narra memperbaiki temuan penghambat dari versi beku. Hasilnya menjadi versi baru dengan
        usulan tersendiri — tidak langsung resmi. Kamu akan melihat perkiraan biaya maksimal dulu.
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
        <input type="hidden" name="proseVersionId" value={proseVersionId} />
        <StartSubmitButton />
      </form>
    </section>
  );
}
