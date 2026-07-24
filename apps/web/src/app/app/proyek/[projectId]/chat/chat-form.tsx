'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  appendIntakeMessageAction,
  type ActionState,
} from '../../../../../server/domain/actions';

const initial: ActionState = { ok: false };

export function ChatForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(appendIntakeMessageAction, initial);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <textarea
        name="content"
        required
        rows={3}
        placeholder="Tulis pesan ke Narra…"
        className="w-full rounded-xl border border-[#e8dce1] px-3 py-3"
      />
      {state.message ? (
        <p className="text-sm text-[#8a2948]" role="alert">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-brand-700 px-5 font-bold text-white disabled:opacity-60"
      >
        {pending ? 'Mengirim…' : 'Kirim'}
      </button>
    </form>
  );
}
