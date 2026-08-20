import type { HTMLAttributes } from 'react';

const gaps = {
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
} as const;

export function Stack({
  gap = 4,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: keyof typeof gaps }) {
  return <div className={`flex flex-col ${gaps[gap]} ${className}`} {...props} />;
}
