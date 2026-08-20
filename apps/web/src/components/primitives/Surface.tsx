import type { HTMLAttributes } from 'react';

export function Surface({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-surface ${className}`} {...props} />;
}
