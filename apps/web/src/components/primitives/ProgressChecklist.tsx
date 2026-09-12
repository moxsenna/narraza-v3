import type { HTMLAttributes } from 'react';

export type ProgressChecklistItem = {
  readonly label: string;
  readonly done: boolean;
  readonly hint?: string | undefined;
};

export function ProgressChecklist({
  percent,
  statusText,
  items,
  recommendation,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  percent: number;
  statusText: string;
  items: readonly ProgressChecklistItem[];
  recommendation?: string | undefined;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <section
      aria-label="Progress checklist"
      className={`rounded-lg border border-default bg-surface p-4 ${className}`}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-3xl font-bold tabular-nums text-primary">{clamped}%</p>
        <p className="text-sm font-semibold text-secondary">{statusText}</p>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={statusText}
        className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-soft"
      >
        <div className="h-full rounded-pill bg-action-primary" style={{ width: `${clamped}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={
                item.done
                  ? 'mt-0.5 inline-flex size-5 items-center justify-center rounded-pill bg-status-success-soft text-status-success'
                  : 'mt-0.5 inline-flex size-5 items-center justify-center rounded-pill border border-default text-muted'
              }
            >
              {item.done ? '✓' : '·'}
            </span>
            <span>
              <span className={item.done ? 'font-semibold text-primary' : 'text-secondary'}>
                {item.label}
              </span>
              {item.hint ? <span className="block text-muted">{item.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {recommendation ? (
        <p className="mt-4 rounded-md bg-brand-soft p-3 text-sm font-semibold text-brand-strong">
          {recommendation}
        </p>
      ) : null}
    </section>
  );
}
