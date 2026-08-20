import type { ReactNode } from 'react';

const tones = {
  neutral: 'bg-surface-soft text-secondary',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-status-success-soft text-status-success',
  warning: 'bg-status-warning-soft text-status-warning',
  danger: 'bg-status-danger-soft text-status-danger',
  info: 'bg-status-info-soft text-status-info',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex rounded-pill px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
