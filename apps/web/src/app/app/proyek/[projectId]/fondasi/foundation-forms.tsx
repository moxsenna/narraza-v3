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
    <section className="mt-8 space-y-6">
      {/* Draft Form - Primary Brand */}
      <form
        action={draftAction}
        className="space-y-4 rounded-2xl border border-line-200 bg-surface p-6 shadow-sm"
      >
        <input type="hidden" name="projectId" value={props.projectId} />
        {props.revision !== null ? (
          <input type="hidden" name="expectedRevision" value={String(props.revision)} />
        ) : null}

        {/* Section Headers - Semantic brand-700 */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700">
          DASAR CERITA
        </h3>

        <label className="block">
          <span className="text-sm font-bold">Konsep inti</span>
          <textarea
            name="coreConcept"
            defaultValue={props.coreConcept}
            disabled={!canEditDraft}
            placeholder="Tentang apa cerita ini?"
            rows={3}
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100 resize-y"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Konflik sentral</span>
          <textarea
            name="conflict"
            defaultValue={props.conflict}
            disabled={!canEditDraft}
            placeholder="Apa yang menghalangi protagonis?"
            rows={2}
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100 resize-y"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Arah akhiran</span>
          <textarea
            name="endingDirection"
            defaultValue={props.endingDirection}
            disabled={!canEditDraft}
            placeholder="Bagaimana berakhirnya?"
            rows={2}
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100 resize-y"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Janji pada pembaca</span>
          <textarea
            name="readerPromise"
            defaultValue={props.readerPromise}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Apa nilai naratif yang dijanjikan?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          TOKOH UTAMA
        </h3>

        <label className="block">
          <span className="text-sm font-bold">Identitas tokoh</span>
          <input
            name="mainCharacterIdentity"
            type="text"
            defaultValue={props.mainCharacterIdentity}
            disabled={!canEditDraft}
            placeholder="Siapa dia secara esensial?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Tujuan utama</span>
          <input
            name="mainCharacterGoal"
            type="text"
            defaultValue={props.mainCharacterGoal}
            disabled={!canEditDraft}
            placeholder="Apa yang paling diinginkannya?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Motivasi / luka</span>
          <input
            name="mainCharacterMotivation"
            type="text"
            defaultValue={props.mainCharacterMotivation}
            disabled={!canEditDraft}
            placeholder="Mengapa dia berusaha? Apa lukanya?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Panggilan</span>
          <input
            name="mainCharacterAddress"
            type="text"
            defaultValue={props.mainCharacterAddress}
            disabled={!canEditDraft}
            placeholder="Bagaimana orang memanggilnya?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold">Gaya bicara</span>
          <input
            name="mainCharacterSpeechStyle"
            type="text"
            defaultValue={props.mainCharacterSpeechStyle}
            disabled={!canEditDraft}
            placeholder="Bagaimana cara dia berbicara?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          RELASI UTAMA
        </h3>

        <input
          type="hidden"
          name="relationshipOtherId"
          value={props.relationshipOtherId || 'other'}
        />

        <label className="block">
          <span className="text-sm font-bold">Jenis hubungan / keterangan</span>
          <textarea
            name="relationshipDescription"
            defaultValue={props.relationshipDescription}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Seperti apa hubungan mereka?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100 resize-y"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          RAHASIA / JADWAL REVEAL
        </h3>

        <label className="block">
          <span className="text-sm font-bold">Isu rahasia</span>
          <textarea
            name="secretTruth"
            defaultValue={props.secretTruth}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Apa rahasia yang akan terungkap?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100 resize-y"
          />
        </label>

        {/* Responsive Grid for Secret Timeline */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">Waktu pengungkapan rahasia</span>
            <input
              name="secretTargetSequence"
              type="number"
              defaultValue={props.secretTargetSequence || '10'}
              disabled={!canEditDraft}
              placeholder="10"
              className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold">Pemicu awal (opsional)</span>
            <input
              name="secretBreadcrumb1Sequence"
              type="number"
              defaultValue={props.secretBreadcrumb1Sequence || ''}
              disabled={!canEditDraft}
              placeholder="-"
              className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold">Pemicu kedua (opsional)</span>
            <input
              name="secretBreadcrumb2Sequence"
              type="number"
              defaultValue={props.secretBreadcrumb2Sequence || ''}
              disabled={!canEditDraft}
              placeholder="-"
              className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
        </div>

        {/* Submit Button - Primary Brand Size LG */}
        {canEditDraft ? (
          <button
            type="submit"
            disabled={draftPending}
            className="w-full min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60 hover:bg-brand-800 transition-colors"
          >
            {draftPending ? 'Menyimpan…' : 'Simpan draft'}
          </button>
        ) : (
          <p className="text-sm text-ink-700 bg-surface-soft border border-line-100 rounded-xl px-3 py-2">
            Fondasi terkunci. Perubahan besar diajukan sebagai usulan di halaman Fakta.
          </p>
        )}
      </form>

      {/* Confirm Action - Secondary Style */}
      {props.status === 'draft' ? (
        <div className="rounded-xl border border-line-200 bg-surface p-4">
          <form action={confirmAction} className="flex justify-end">
            <input type="hidden" name="projectId" value={props.projectId} />
            <button
              type="submit"
              disabled={confirmPending}
              className="min-h-11 rounded-xl border border-line-200 bg-surface px-5 font-semibold disabled:opacity-60 hover:border-gray-400"
            >
              {confirmPending ? '…' : 'Konfirmasi fondasi'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Lock Action - High Contrast Warning */}
      {props.status === 'confirmed' ? (
        <div className="rounded-xl border border-line-200 bg-surface p-6">
          <input type="hidden" name="projectId" value={props.projectId} />
          <p className="text-sm text-ink-700 mb-4">
            Mengunci fondasi membekukan dasar cerita. Perubahan besar diajukan sebagai usulan.
          </p>

          <label className="flex items-center gap-2 text-sm font-semibold mb-4">
            <input type="checkbox" name="acknowledged" />
            Aku mengerti konsekuensinya
          </label>

          <button
            type="submit"
            formAction={lockAction}
            disabled={lockPending}
            className="w-full min-h-11 rounded-xl bg-brand-900 px-5 font-bold text-white disabled:opacity-60 hover:bg-brand-950 transition-colors"
          >
            {lockPending ? '…' : 'Kunci fondasi'}
          </button>
        </div>
      ) : null}

      {/* Error Alert - Semantic Colors */}
      {err ? (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700" role="alert">
          {err}
        </p>
      ) : null}
    </section>
  );
}
