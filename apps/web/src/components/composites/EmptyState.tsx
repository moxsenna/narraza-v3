import type { ReactNode } from 'react';

export function EmptyState({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-default bg-surface px-5 py-10 text-center shadow-sm sm:px-8 sm:py-14">
      <span
        aria-hidden="true"
        className="mx-auto flex size-14 items-center justify-center rounded-lg bg-brand-soft text-2xl font-extrabold text-brand-strong"
      >
        N
      </span>
      {eyebrow ? (
        <p className="mt-5 text-xs font-extrabold tracking-[0.12em] text-brand-strong">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 text-2xl font-bold text-primary sm:text-[26px]">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl leading-7 text-secondary">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
