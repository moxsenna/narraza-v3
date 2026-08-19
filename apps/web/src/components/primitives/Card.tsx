import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={`rounded-lg border border-default bg-surface p-6 ${className}`}
      {...props}
    />
  );
}
