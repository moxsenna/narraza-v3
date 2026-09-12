import type { HTMLAttributes, ReactNode } from 'react';

export function EmptyState({
  title,
  children,
  action,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: string;
  children: ReactNode;
  action?: ReactNode | undefined;
}) {
  return (
    <section
      aria-label={title}
      className={`flex flex-col items-center rounded-lg border border-default bg-surface px-6 py-10 text-center ${className}`}
      {...props}
    >
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      <div className="mt-2 max-w-prose text-sm text-secondary">{children}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
