import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

const styles: Record<ButtonVariant, string> = {
  primary:
    'bg-action-primary text-white hover:bg-action-primary-hover active:bg-action-primary-active',
  secondary:
    'border border-default bg-surface text-primary hover:border-active hover:bg-brand-soft',
  tertiary: 'bg-transparent text-brand-strong hover:bg-brand-soft',
  destructive: 'bg-status-danger text-white hover:opacity-90',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-bold disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
});
