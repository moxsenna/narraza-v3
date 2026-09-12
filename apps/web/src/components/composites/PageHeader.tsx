import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-extrabold tracking-[0.12em] text-brand-strong">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl leading-tight font-bold text-primary sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-base leading-7 text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
