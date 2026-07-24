'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmFoundationAction,
  lockFoundationAction,
  updateFoundationDraftAction,
  type ActionState,
} from '../../../../../server/domain/actions';

const initial: ActionState = { ok: false };

export function FoundationForms(props: {
  projectId: string;
  status: string | null;
  revision: number | null;
  coreConcept: string;
  conflict: string;
  endingDirection: string;
  readerPromise: string;
}) {
  const router = useRouter();
  const locked = props.status === 'locked';
  const [draftState, draftAction, draftPending] = useActionState(
    updateFoundationDraftAction,
    initial,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmFoundationAction,
    initial,
  );
  const [lockState, lockAction, lockPending] = useActionState(lockFoundationAction, initial);

  useEffect(() => {
    if (draftState.ok || confirmState.ok || lockState.ok) router.refresh();
  }, [draftState, confirmState, lockState, router]);

  const err = draftState.message || confirmState.message || lockState.message;

  return (
    <div className="mt-8 space-y-6">
      <form action={draftAction} className="space-y-4 rounded-2xl border border-[#e8dce1] bg-white p-6">
        <input type="hidden" name="projectId" value={props.projectId} />
        {props.revision !== null ? (
          <input type="hidden" name="expectedRevision" value={String(props.revision)} />
        ) : null}
        <Field name="coreConcept" label="Konsep inti" defaultValue={props.coreConcept} disabled={locked} />
        <Field name="conflict" label="Konflik" defaultValue={props.conflict} disabled={locked} />
        <Field
          name="endingDirection"
          label="Arah ending"
          defaultValue={props.endingDirection}
          disabled={locked}
        />
        <Field
          name="readerPromise"
          label="Janji pembaca"
          defaultValue={props.readerPromise}
          disabled={locked}
        />
        {!locked ? (
          <button
            type="submit"
            disabled={draftPending}
            className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
          >
            {draftPending ? 'Menyimpan…' : 'Simpan draft'}
          </button>
        ) : (
          <p className="text-sm text-[#76656d]">Fondasi terkunci. Perubahan lewat proposal (M5).</p>
        )}
      </form>

      {props.status === 'draft' ? (
        <form action={confirmAction}>
          <input type="hidden" name="projectId" value={props.projectId} />
          <button
            type="submit"
            disabled={confirmPending}
            className="min-h-11 rounded-xl border border-[#e8dce1] bg-white px-5 font-semibold disabled:opacity-60"
          >
            {confirmPending ? '…' : 'Konfirmasi fondasi'}
          </button>
        </form>
      ) : null}

      {props.status === 'confirmed' ? (
        <form action={lockAction} className="rounded-2xl border border-[#e8dce1] bg-white p-6">
          <input type="hidden" name="projectId" value={props.projectId} />
          <p className="text-sm text-[#4a3a42]">
            Mengunci fondasi membekukan dasar cerita. Checklist kesiapan harus lengkap (100%).
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="acknowledged" />
            Aku mengerti konsekuensinya
          </label>
          <button
            type="submit"
            disabled={lockPending}
            className="mt-4 min-h-11 rounded-xl bg-brand-900 px-5 font-bold text-white disabled:opacity-60"
          >
            {lockPending ? '…' : 'Kunci fondasi'}
          </button>
        </form>
      ) : null}

      {err ? (
        <p className="rounded-xl bg-[#fff0f3] px-3 py-2 text-sm text-[#8a2948]" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function Field(props: {
  name: string;
  label: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{props.label}</span>
      <textarea
        name={props.name}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        rows={2}
        className="mt-2 w-full rounded-xl border border-[#e8dce1] px-3 py-2 disabled:bg-[#f8f1f4]"
      />
    </label>
  );
}
