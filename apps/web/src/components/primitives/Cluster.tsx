import type { HTMLAttributes } from 'react';

const gaps = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
} as const;

export function Cluster({
  gap = 3,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: keyof typeof gaps }) {
  return <div className={`flex flex-wrap items-center ${gaps[gap]} ${className}`} {...props} />;
}
