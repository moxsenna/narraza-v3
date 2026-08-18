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
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
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
          <input
            name="coreConcept"
            type="text"
            defaultValue={props.coreConcept}
            disabled={!canEditDraft}
            placeholder="Tentang apa cerita ini?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        
        <label className="block">
          <span className="text-sm font-bold">Konflik sentral</span>
          <input
            name="conflict"
            type="text"
            defaultValue={props.conflict}
            disabled={!canEditDraft}
            placeholder="Apa yang menghalangi protagonis?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        
        <label className="block">
          <span className="text-sm font-bold">Arah akhiran</span>
          <input
            name="endingDirection"
            type="text"
            defaultValue={props.endingDirection}
            disabled={!canEditDraft}
            placeholder="Bagaimana berakhirnya?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          TOKOH UTAMA
        </h3>
        
        <label className="block">
          <span className="text-sm font-bold">ID tokoh utama (internal)</span>
          <input
            name="mainCharacterId"
            type="text"
            defaultValue={props.mainCharacterId || 'main'}
            disabled={!canEditDraft}
            placeholder="main"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        
        <label className="block">
          <span className="text-sm font-bold">Identitas</span>
          <input
            name="mainCharacterIdentity"
            type="text"
            defaultValue={props.mainCharacterIdentity}
            disabled={!canEditDraft}
            placeholder="Siapa dia secara esensial?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          RELASI UTAMA
        </h3>
        
        <label className="block">
          <span className="text-sm font-bold">ID tokoh lain</span>
          <input
            name="relationshipOtherId"
            type="text"
            defaultValue={props.relationshipOtherId || 'other'}
            disabled={!canEditDraft}
            placeholder="other"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        
        <label className="block">
          <span className="text-sm font-bold">Jenis hubungan / keterangan</span>
          <textarea
            name="relationshipDescription"
            defaultValue={props.relationshipDescription}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Seperti apa hubungan mereka?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>

        {/* Section Header */}
        <h3 className="text-xs font-extrabold tracking-widest uppercase text-brand-700 pt-2">
          RAHASIA / JADWAL REVEAL
        </h3>
        
        <label className="block">
          <span className="text-sm font-bold">Rahasia (truth)</span>
          <textarea
            name="secretTruth"
            defaultValue={props.secretTruth}
            disabled={!canEditDraft}
            rows={2}
            placeholder="Apa rahasia yang akan terungkap?"
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          />
        </label>
        
        {/* Responsive Grid for Secret Timeline */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">Target chapterId</span>
            <input
              name="secretTargetChapterId"
              type="text"
              defaultValue={props.secretTargetChapterId || 'chapter-10'}
              disabled={!canEditDraft}
              placeholder="chapter-10"
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-bold">Target sequence</span>
            <input
              name="secretTargetSequence"
              type="number"
              defaultValue={props.secretTargetSequence || '10'}
              disabled={!canEditDraft}
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-bold">Breadcrumb 1 chapterId</span>
            <input
              name="secretBreadcrumb1ChapterId"
              type="text"
              defaultValue={props.secretBreadcrumb1ChapterId || 'chapter-2'}
              disabled={!canEditDraft}
              placeholder="chapter-2"
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-bold">Breadcrumb 1 sequence</span>
            <input
              name="secretBreadcrumb1Sequence"
              type="number"
              defaultValue={props.secretBreadcrumb1Sequence || '2'}
              disabled={!canEditDraft}
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-bold">Breadcrumb 2 chapterId</span>
            <input
              name="secretBreadcrumb2ChapterId"
              type="text"
              defaultValue={props.secretBreadcrumb2ChapterId || 'chapter-5'}
              disabled={!canEditDraft}
              placeholder="chapter-5"
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
            />
          </label>
          
          <label className="block">
            <span className="text-sm font-bold">Breadcrumb 2 sequence</span>
            <input
              name="secretBreadcrumb2Sequence"
              type="number"
              defaultValue={props.secretBreadcrumb2Sequence || '5'}
              disabled={!canEditDraft}
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
          <p className="text-sm text-[#4a3a42] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            Fondasi terkunci. Perubahan melalui proposal (M5).
          </p>
        )}
      </form>

      {/* Confirm Action - Secondary Style */}
      {props.status === 'draft' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <form action={confirmAction} className="flex justify-end">
            <input type="hidden" name="projectId" value={props.projectId} />
            <button
              type="submit"
              disabled={confirmPending}
              className="min-h-11 rounded-xl border border-gray-300 bg-white px-5 font-semibold disabled:opacity-60 hover:border-gray-400"
            >
              {confirmPending ? '…' : 'Konfirmasi fondasi'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Lock Action - High Contrast Warning */}
      {props.status === 'confirmed' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <input type="hidden" name="projectId" value={props.projectId} />
          <p className="text-sm text-gray-700 mb-4">
            Mengunci fondasi membekukan dasar cerita. Checklist kesiapan harus lengkap (100%).
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
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>
      ) : null}
    </section>
  );
}
