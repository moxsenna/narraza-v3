import type { ReactNode } from 'react';

/**
 * Bubble chat (design.md §15.6): pengguna = surface putih berborder di kanan,
 * Narra = bg-brand-soft dengan ikon Narra kecil. Tanpa avatar humanoid.
 */
export function ChatBubble({
  from,
  children,
  timestamp,
  className = '',
}: {
  from: 'user' | 'narra';
  children: ReactNode;
  timestamp?: string | undefined;
  className?: string;
}) {
  if (from === 'user') {
    return (
      <div className={`flex justify-end ${className}`}>
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-default bg-surface px-4 py-3 shadow-sm sm:max-w-[70%]">
          <div className="text-base leading-7 text-primary">{children}</div>
          {timestamp ? <p className="mt-1 text-right text-xs text-muted">{timestamp}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex justify-start gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className="mt-1 grid size-8 shrink-0 place-items-center rounded-pill bg-brand-soft text-sm font-extrabold text-brand-strong"
      >
        N
      </span>
      <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-brand-soft px-4 py-3 sm:max-w-[70%]">
        <div className="text-base leading-7 text-primary">{children}</div>
        {timestamp ? <p className="mt-1 text-xs text-muted">{timestamp}</p> : null}
      </div>
    </div>
  );
}
