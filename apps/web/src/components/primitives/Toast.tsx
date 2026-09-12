import type { HTMLAttributes, ReactNode } from 'react';

const tones = {
  info: 'bg-status-info-soft text-status-info',
  success: 'bg-status-success-soft text-status-success',
  warning: 'bg-status-warning-soft text-status-warning',
  danger: 'bg-status-danger-soft text-status-danger',
} as const;

export type ToastTone = keyof typeof tones;

export function Toast({
  tone = 'info',
  title,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone?: ToastTone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-lg border border-default bg-surface p-4 shadow-md ${tones[tone]} ${className}`}
      {...props}
    >
      <p className="text-sm font-bold">{title}</p>
      {children ? <div className="mt-1 text-sm">{children}</div> : null}
    </section>
  );
}
