import type { HTMLAttributes, ReactNode } from 'react';

const tones = {
  info: 'border-default bg-status-info-soft text-status-info',
  success: 'border-default bg-status-success-soft text-status-success',
  warning: 'border-default bg-status-warning-soft text-status-warning',
  danger: 'border-default bg-status-danger-soft text-status-danger',
} as const;

export type BannerTone = keyof typeof tones;

export function Banner({
  tone = 'info',
  title,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone?: BannerTone;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-lg border p-4 ${tones[tone]} ${className}`}
      {...props}
    >
      <h2 className="text-sm font-bold">{title}</h2>
      <div className="mt-1 text-sm">{children}</div>
    </section>
  );
}
