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

export type FoundationFormValues = {
  projectId: string;
  status: string | null;
  revision: number | null;
  coreConcept: string;
  conflict: string;
  endingDirection: string;
  readerPromise: string;
  mainCharacterId: string;
  mainCharacterIdentity: string;
  mainCharacterGoal: string;
  mainCharacterMotivation: string;
  mainCharacterAddress: string;
  mainCharacterSpeechStyle: string;
  relationshipOtherId: string;
  relationshipDescription: string;
  secretTruth: string;
  secretTargetChapterId: string;
  secretTargetSequence: string;
  secretBreadcrumb1ChapterId: string;
  secretBreadcrumb1Sequence: string;
  secretBreadcrumb2ChapterId: string;
  secretBreadcrumb2Sequence: string;
};

export function FoundationForms(props: FoundationFormValues) {
  const router = useRouter();
  // Application only allows draft updates; confirmed/locked fields are read-only in UI.
  const canEditDraft = props.status !== 'locked';
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
      <form
        action={draftAction}
        className="space-y-4 rounded-2xl border border-[#e8dce1] bg-white p-6"
      >
        <input type="hidden" name="projectId" value={props.projectId} />
        {props.revision !== null ? (
          <input type="hidden" name="expectedRevision" value={String(props.revision)} />
        ) : null}

        <h2 className="text-sm font-extrabold tracking-[0.12em] text-brand-700">DASAR CERITA</h2>
        <Field
          name="coreConcept"
          label="Konsep inti"
          defaultValue={props.coreConcept}
          disabled={!canEditDraft}
        />
        <Field
          name="conflict"
          label="Konflik"
          defaultValue={props.conflict}
          disabled={!canEditDraft}
        />
        <Field
          name="endingDirection"
          label="Arah ending"
          defaultValue={props.endingDirection}
          disabled={!canEditDraft}
        />
        <Field
          name="readerPromise"
          label="Janji pembaca"
          defaultValue={props.readerPromise}
          disabled={!canEditDraft}
        />

        <h2 className="pt-2 text-sm font-extrabold tracking-[0.12em] text-brand-700">
          TOKOH UTAMA
        </h2>
        {props.mainCharacterId ? (
          <input type="hidden" name="mainCharacterId" value={props.mainCharacterId} />
        ) : null}
        <TextInput
          name="mainCharacterIdentity"
          label="Identitas"
          defaultValue={props.mainCharacterIdentity}
          disabled={!canEditDraft}
        />
        <TextInput
          name="mainCharacterGoal"
          label="Tujuan"
          defaultValue={props.mainCharacterGoal}
          disabled={!canEditDraft}
        />
        <TextInput
          name="mainCharacterMotivation"
          label="Motivasi / luka"
          defaultValue={props.mainCharacterMotivation}
          disabled={!canEditDraft}
        />
        <TextInput
          name="mainCharacterAddress"
          label="Panggilan"
          defaultValue={props.mainCharacterAddress}
          disabled={!canEditDraft}
        />
        <TextInput
          name="mainCharacterSpeechStyle"
          label="Gaya bicara"
          defaultValue={props.mainCharacterSpeechStyle}
          disabled={!canEditDraft}
        />

        <h2 className="pt-2 text-sm font-extrabold tracking-[0.12em] text-brand-700">
          RELASI UTAMA
        </h2>
        {props.relationshipOtherId ? (
          <input type="hidden" name="relationshipOtherId" value={props.relationshipOtherId} />
        ) : null}
        <Field
          name="relationshipDescription"
          label="Jenis hubungan / keterangan"
          defaultValue={props.relationshipDescription}
          disabled={!canEditDraft || !props.relationshipOtherId}
          placeholder={
            props.relationshipOtherId
              ? 'Seperti apa hubungan mereka?'
              : 'Tidak ada tokoh lain yang terkait (edit tersimpan tanpa menciptakan relasi baru)'
          }
        />

        <h2 className="pt-2 text-sm font-extrabold tracking-[0.12em] text-brand-700">
          RAHASIA / JADWAL REVEAL
        </h2>
        <Field
          name="secretTruth"
          label="Isu rahasia"
          defaultValue={props.secretTruth}
          disabled={!canEditDraft}
        />
        {props.secretTargetChapterId ? (
          <>
            <input type="hidden" name="secretTargetChapterId" value={props.secretTargetChapterId} />
            <input type="hidden" name="secretTargetSequence" value={props.secretTargetSequence || ''} />
          </>
        ) : null}
        {props.secretBreadcrumb1ChapterId ? (
          <>
            <input type="hidden" name="secretBreadcrumb1ChapterId" value={props.secretBreadcrumb1ChapterId} />
            <input type="hidden" name="secretBreadcrumb1Sequence" value={props.secretBreadcrumb1Sequence || ''} />
          </>
        ) : null}
        {props.secretBreadcrumb2ChapterId ? (
          <>
            <input type="hidden" name="secretBreadcrumb2ChapterId" value={props.secretBreadcrumb2ChapterId} />
            <input type="hidden" name="secretBreadcrumb2Sequence" value={props.secretBreadcrumb2Sequence || ''} />
          </>
        ) : null}

        {(!props.secretTargetChapterId || !props.secretBreadcrumb1ChapterId) && (
          <p className="mt-2 text-xs text-ink-500 italic">
            Jadwal pengungkapan memerlukan bab referensi. Tidak dapat disetel saat ini.
          </p>
        )}

        {canEditDraft ? (
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

function Field(props: { name: string; label: string; defaultValue: string; disabled?: boolean }) {
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

function TextInput(props: {
  name: string;
  label: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{props.label}</span>
      <input
        name={props.name}
        type="text"
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        className="mt-2 w-full rounded-xl border border-[#e8dce1] px-3 py-2 disabled:bg-[#f8f1f4]"
      />
    </label>
  );
}
