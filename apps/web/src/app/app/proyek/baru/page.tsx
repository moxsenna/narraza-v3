'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  createProjectAction,
  type ActionState,
} from '../../../../server/domain/actions';

const JALUR = [
  { value: 'no_idea', label: 'Belum punya ide' },
  { value: 'rough_idea', label: 'Ide kasar' },
  { value: 'has_outline', label: 'Punya outline' },
  { value: 'fix_story', label: 'Perbaiki cerita' },
] as const;

const initial: ActionState = { ok: false };

export default function NewProjectPage() {
  const [state, action, pending] = useActionState(createProjectAction, initial);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
      <Link href="/app" className="text-sm font-semibold text-brand-700">
        ← Dashboard
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Buat proyek</h1>
      <p className="mt-2 text-[#4a3a42]">Pilih jalur mulai. Draft import belum tersedia (Segera hadir).</p>

      <form action={action} className="mt-8 space-y-5 rounded-2xl border border-[#e8dce1] bg-white p-6">
        <label className="block">
          <span className="text-sm font-bold">Judul (opsional)</span>
          <input
            name="title"
            type="text"
            className="mt-2 w-full rounded-xl border border-[#e8dce1] px-3 py-3"
            placeholder="Cerita baru"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Jalur</legend>
          {JALUR.map((j) => (
            <label key={j.value} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e8dce1] px-3 py-2">
              <input type="radio" name="jalur" value={j.value} defaultChecked={j.value === 'rough_idea'} required />
              <span>{j.label}</span>
            </label>
          ))}
          <label className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-xl border border-[#e8dce1] px-3 py-2 opacity-50">
            <input type="radio" name="jalur" value="has_draft" disabled />
            <span>Punya draft — Segera hadir</span>
          </label>
        </fieldset>

        {state.message ? (
          <p className="rounded-xl bg-[#fff0f3] px-3 py-2 text-sm text-[#8a2948]" role="alert">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-xl bg-brand-700 px-4 font-bold text-white disabled:opacity-60"
        >
          {pending ? 'Membuat…' : 'Buat proyek'}
        </button>
      </form>
    </main>
  );
}
