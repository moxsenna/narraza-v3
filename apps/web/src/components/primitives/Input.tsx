import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`min-h-11 w-full rounded-md border border-default bg-surface px-3 text-base text-primary placeholder:text-muted focus:border-active aria-invalid:border-status-danger ${className}`}
        {...props}
      />
    );
  },
);
