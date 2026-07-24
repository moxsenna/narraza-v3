'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createOutlineRoadmapAction,
  type ActionState,
} from '../../../../../server/domain/actions';

const initial: ActionState = { ok: false };

export function OutlineForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createOutlineRoadmapAction, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#e8dce1] bg-white p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="min-w-[12rem] flex-1">
        <span className="text-sm font-bold">Judul roadmap</span>
        <input
          name="title"
          type="text"
          defaultValue="Roadmap utama"
          className="mt-2 w-full rounded-xl border border-[#e8dce1] px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
      >
        {pending ? '…' : 'Tambah roadmap'}
      </button>
      {state.message ? (
        <p className="w-full text-sm text-[#8a2948]" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
