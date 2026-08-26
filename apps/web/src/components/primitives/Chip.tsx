import type { ButtonHTMLAttributes } from 'react';

export function Chip({
  selected,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`min-h-11 rounded-pill border px-4 text-sm font-semibold ${selected ? 'border-active bg-brand-soft text-brand-strong' : 'border-default bg-surface text-secondary'} ${className}`}
      {...props}
    />
  );
}
