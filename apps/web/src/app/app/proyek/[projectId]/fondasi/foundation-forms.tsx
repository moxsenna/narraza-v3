'use client';

import { useActionState, useEffect, useState } from 'react';
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
  relationshipMainIsFrom: boolean | null;
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
  const [lockAcknowledged, setLockAcknowledged] = useState(false);

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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft resize-y"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft resize-y"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft resize-y"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          TOKOH UTAMA
        </h3>

        {props.mainCharacterId ? (
          <input type="hidden" name="mainCharacterId" value={props.mainCharacterId} />
        ) : null}

        <label className="block">
          <span className="text-sm font-bold">Identitas tokoh</span>
          <input
            name="mainCharacterIdentity"
            type="text"
            defaultValue={props.mainCharacterIdentity}
            disabled={!canEditDraft}
            placeholder="Siapa dia secara esensial?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
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
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          RELASI UTAMA
        </h3>

        {props.relationshipOtherId && props.relationshipMainIsFrom !== null ? (
          <>
            <input type="hidden" name="relationshipOtherId" value={props.relationshipOtherId} />
            <input
              type="hidden"
              name="relationshipMainIsFrom"
              value={String(props.relationshipMainIsFrom)}
            />
          </>
        ) : null}

        <label className="block">
          <span className="text-sm font-bold">Jenis hubungan / keterangan</span>
          <textarea
            name="relationshipDescription"
            defaultValue={props.relationshipDescription}
            disabled={!canEditDraft || !props.relationshipOtherId}
            rows={2}
            placeholder={
              props.relationshipOtherId
                ? 'Seperti apa hubungan mereka?'
                : 'Tidak ada tokoh lain yang terkait (edit tersimpan tanpa menciptakan relasi baru)'
            }
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft resize-y"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          Jadwal Rahasia
        </h3>

        <label className="block">
          <span className="text-sm font-bold">Isu rahasia</span>
          <textarea
            name="secretTruth"
            defaultValue={props.secretTruth}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Apa rahasia yang akan terungkap?"
            className="mt-2 w-full rounded-xl border border-line-200 px-3 py-2 disabled:bg-surface-soft resize-y"
          />
        </label>

        {/* Hidden preservation of existing schedule references */}
        {props.secretTargetChapterId ? (
          <>
            <input type="hidden" name="secretTargetChapterId" value={props.secretTargetChapterId} />
            <input type="hidden" name="secretTargetSequence" value={props.secretTargetSequence} />
          </>
        ) : null}
        {props.secretBreadcrumb1ChapterId ? (
          <>
            <input
              type="hidden"
              name="secretBreadcrumb1ChapterId"
              value={props.secretBreadcrumb1ChapterId}
            />
            <input
              type="hidden"
              name="secretBreadcrumb1Sequence"
              value={props.secretBreadcrumb1Sequence}
            />
          </>
        ) : null}
        {props.secretBreadcrumb2ChapterId ? (
          <>
            <input
              type="hidden"
              name="secretBreadcrumb2ChapterId"
              value={props.secretBreadcrumb2ChapterId}
            />
            <input
              type="hidden"
              name="secretBreadcrumb2Sequence"
              value={props.secretBreadcrumb2Sequence}
            />
          </>
        ) : null}

        {!props.secretTargetChapterId && !props.secretBreadcrumb1ChapterId && (
          <p className="mt-2 text-xs text-ink-500 italic">
            Jadwal pengungkapan memerlukan bab referensi. Tidak dapat disetel saat ini.
          </p>
        )}

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
              className="min-h-11 rounded-xl border border-line-200 bg-surface px-5 font-semibold disabled:opacity-60 hover:border-border-active"
            >
              {confirmPending ? '…' : 'Konfirmasi fondasi'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Lock Action - High Contrast Warning */}
      {props.status === 'confirmed' ? (
        <form action={lockAction} className="rounded-xl border border-line-200 bg-surface p-6">
          <input type="hidden" name="projectId" value={props.projectId} />
          <p className="text-sm text-ink-700 mb-4">
            Mengunci fondasi membekukan dasar cerita. Perubahan besar diajukan sebagai usulan.
          </p>

          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold mb-4">
            <input
              type="checkbox"
              name="acknowledged"
              checked={lockAcknowledged}
              onChange={(event) => setLockAcknowledged(event.target.checked)}
              className="size-5"
            />
            Aku mengerti konsekuensinya
          </label>

          <button
            type="submit"
            disabled={lockPending || !lockAcknowledged}
            className="w-full min-h-11 rounded-xl bg-brand-900 px-5 font-bold text-white disabled:opacity-60 hover:bg-brand-800 transition-colors"
          >
            {lockPending ? '…' : 'Kunci fondasi'}
          </button>
        </form>
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
