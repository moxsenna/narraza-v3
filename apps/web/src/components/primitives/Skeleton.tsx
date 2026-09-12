import type { HTMLAttributes } from 'react';

const tones = {
  neutral: 'bg-surface-soft text-secondary',
  brand: 'bg-brand-soft text-brand-strong',
  success: 'bg-status-success-soft text-status-success',
  warning: 'bg-status-warning-soft text-status-warning',
  danger: 'bg-status-danger-soft text-status-danger',
  info: 'bg-status-info-soft text-status-info',
} as const;

export type SkeletonTone = keyof typeof tones;

export function Skeleton({
  tone = 'neutral',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: SkeletonTone }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
