import Link from 'next/link';
import type { ComponentProps } from 'react';
import type { ButtonVariant } from './Button';

const styles: Record<Exclude<ButtonVariant, 'destructive'>, string> = {
  primary: 'bg-action-primary text-white hover:bg-action-primary-hover',
  secondary:
    'border border-default bg-surface text-primary hover:border-active hover:bg-brand-soft',
  tertiary: 'text-brand-strong hover:bg-brand-soft',
};

export type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: Exclude<ButtonVariant, 'destructive'>;
};

export function LinkButton({ variant = 'primary', className = '', ...props }: LinkButtonProps) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-bold ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
