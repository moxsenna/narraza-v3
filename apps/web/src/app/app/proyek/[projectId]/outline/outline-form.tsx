'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createOutlineArcAction,
  createOutlineChapterAction,
  createOutlineRoadmapAction,
  type ActionState,
} from '../../../../../server/domain/actions';

const initial: ActionState = { ok: false };

export type OutlineOption = { id: string; title: string };

export function OutlineForm(props: {
  projectId: string;
  roadmaps: readonly OutlineOption[];
  arcs: readonly OutlineOption[];
  nextChapterOrdinal: number;
}) {
  const router = useRouter();
  const [roadmapState, roadmapAction, roadmapPending] = useActionState(
    createOutlineRoadmapAction,
    initial,
  );
  const [arcState, arcAction, arcPending] = useActionState(createOutlineArcAction, initial);
  const [chapterState, chapterAction, chapterPending] = useActionState(
    createOutlineChapterAction,
    initial,
  );

  useEffect(() => {
    if (roadmapState.ok || arcState.ok || chapterState.ok) router.refresh();
  }, [roadmapState, arcState, chapterState, router]);

  const err = roadmapState.message || arcState.message || chapterState.message;
  const defaultRoadmap = props.roadmaps[0]?.id ?? '';
  const defaultArc = props.arcs[0]?.id ?? '';

  return (
    <div className="mt-6 space-y-4">
      <form
        action={roadmapAction}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4"
      >
        <input type="hidden" name="projectId" value={props.projectId} />
        <label className="min-w-[12rem] flex-1">
          <span className="text-sm font-bold">Judul roadmap</span>
          <input
            name="title"
            type="text"
            defaultValue="Roadmap utama"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={roadmapPending}
          className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
        >
          {roadmapPending ? '…' : 'Tambah roadmap'}
        </button>
      </form>

      <form
        action={arcAction}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4"
      >
        <input type="hidden" name="projectId" value={props.projectId} />
        <label className="min-w-[10rem]">
          <span className="text-sm font-bold">Roadmap</span>
          <select
            name="parentId"
            defaultValue={defaultRoadmap}
            required
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          >
            {props.roadmaps.length === 0 ? (
              <option value="">Buat roadmap dulu</option>
            ) : (
              props.roadmaps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title || r.id}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1">
          <span className="text-sm font-bold">Judul arc</span>
          <input
            name="title"
            type="text"
            defaultValue="Arc 1"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="w-24">
          <span className="text-sm font-bold">Ordinal</span>
          <input
            name="ordinal"
            type="number"
            defaultValue={0}
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={arcPending || props.roadmaps.length === 0}
          className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
        >
          {arcPending ? '…' : 'Tambah arc'}
        </button>
      </form>

      <form
        action={chapterAction}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4"
      >
        <input type="hidden" name="projectId" value={props.projectId} />
        <label className="min-w-[10rem]">
          <span className="text-sm font-bold">Arc</span>
          <select
            name="parentId"
            defaultValue={defaultArc}
            required
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          >
            {props.arcs.length === 0 ? (
              <option value="">Buat arc dulu</option>
            ) : (
              props.arcs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title || a.id}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1">
          <span className="text-sm font-bold">Judul bab</span>
          <input
            name="title"
            type="text"
            required
            placeholder="Judul bab"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="w-24">
          <span className="text-sm font-bold">No. bab</span>
          <input
            name="ordinal"
            type="number"
            defaultValue={props.nextChapterOrdinal}
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={chapterPending || props.arcs.length === 0}
          className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
        >
          {chapterPending ? '…' : 'Tambah bab'}
        </button>
      </form>

      {err ? (
        <p className="rounded-xl bg-pink-100 px-3 py-2 text-sm text-pink-900" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
