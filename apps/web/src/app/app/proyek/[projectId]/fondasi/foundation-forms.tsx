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
  const canEditDraft = props.status !== 'confirmed' && props.status !== 'locked';
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
        <TextInput
          name="mainCharacterId"
          label="ID tokoh utama (internal)"
          defaultValue={props.mainCharacterId || 'main'}
          disabled={!canEditDraft}
        />
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
        <TextInput
          name="relationshipOtherId"
          label="ID tokoh lain"
          defaultValue={props.relationshipOtherId || 'other'}
          disabled={!canEditDraft}
        />
        <Field
          name="relationshipDescription"
          label="Jenis hubungan / keterangan"
          defaultValue={props.relationshipDescription}
          disabled={!canEditDraft}
        />

        <h2 className="pt-2 text-sm font-extrabold tracking-[0.12em] text-brand-700">
          RAHASIA / JADWAL REVEAL
        </h2>
        <Field
          name="secretTruth"
          label="Rahasia (truth)"
          defaultValue={props.secretTruth}
          disabled={!canEditDraft}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            name="secretTargetChapterId"
            label="Target chapterId"
            defaultValue={props.secretTargetChapterId || 'chapter-10'}
            disabled={!canEditDraft}
          />
          <TextInput
            name="secretTargetSequence"
            label="Target sequence"
            defaultValue={props.secretTargetSequence || '10'}
            disabled={!canEditDraft}
          />
          <TextInput
            name="secretBreadcrumb1ChapterId"
            label="Breadcrumb 1 chapterId"
            defaultValue={props.secretBreadcrumb1ChapterId || 'chapter-2'}
            disabled={!canEditDraft}
          />
          <TextInput
            name="secretBreadcrumb1Sequence"
            label="Breadcrumb 1 sequence"
            defaultValue={props.secretBreadcrumb1Sequence || '2'}
            disabled={!canEditDraft}
          />
          <TextInput
            name="secretBreadcrumb2ChapterId"
            label="Breadcrumb 2 chapterId"
            defaultValue={props.secretBreadcrumb2ChapterId || 'chapter-5'}
            disabled={!canEditDraft}
          />
          <TextInput
            name="secretBreadcrumb2Sequence"
            label="Breadcrumb 2 sequence"
            defaultValue={props.secretBreadcrumb2Sequence || '5'}
            disabled={!canEditDraft}
          />
        </div>

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
