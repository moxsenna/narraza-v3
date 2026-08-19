import type { ButtonHTMLAttributes } from 'react';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  'aria-label': string;
};

export function IconButton({ className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex size-11 items-center justify-center rounded-md border border-default bg-surface text-primary disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}
