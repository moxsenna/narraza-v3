import type { ReactNode } from 'react';

export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: (metadata: { describedBy: string | undefined; invalid: boolean }) => ReactNode;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-primary">
        {label}
      </label>
      {children({ describedBy, invalid: Boolean(error) })}
      {help ? (
        <p id={helpId} className="text-sm text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
