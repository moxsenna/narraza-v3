'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuickReplies } from '../../../../../components/composites/QuickReplies';
import { appendIntakeMessageAction, type ActionState } from '../../../../../server/domain/actions';

const initial: ActionState = { ok: false };
const suggestions = [
  'Tokoh utamanya sudah ada',
  'Aku baru punya konfliknya',
  'Aku tahu suasana yang kuinginkan',
] as const;

export function ChatForm({ projectId, signalCount }: { projectId: string; signalCount: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState('');
  const [state, action, pending] = useActionState(appendIntakeMessageAction, initial);

  useEffect(() => {
    if (state.ok) {
      setDraft('');
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="bg-canvas">
      <div className="mx-auto flex max-w-[680px] gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:px-6 xl:px-0">
        <QuickReplies options={suggestions} onSelect={setDraft} disabled={pending} />
      </div>

      <form
        ref={formRef}
        action={action}
        className="border-t border-default bg-surface px-4 py-3 shadow-[0_-8px_24px_rgba(36,23,30,0.05)] sm:px-6 xl:px-7"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div className="mx-auto flex max-w-[680px] items-end gap-2">
          <label className="sr-only" htmlFor="chat-content">
            Pesan untuk Narra
          </label>
          <textarea
            id="chat-content"
            name="content"
            required
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ceritakan apa saja…"
            className="min-h-11 max-h-32 flex-1 resize-none rounded-pill border border-default bg-surface px-4 py-2.5 text-sm leading-6 xl:rounded-lg"
          />
          <button
            type="submit"
            aria-label="Kirim pesan"
            disabled={pending || draft.trim().length === 0}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-strong font-bold text-white disabled:opacity-50 xl:w-auto xl:rounded-lg xl:px-5"
          >
            <span aria-hidden="true" className="xl:hidden">
              ↑
            </span>
            <span className="hidden xl:inline">{pending ? 'Mengirim…' : 'Kirim'}</span>
          </button>
        </div>
        <p className="sr-only">Sinyal {signalCount}/6</p>
        {state.message ? (
          <p className="mx-auto mt-2 max-w-[680px] text-sm text-status-danger" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
