import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`field-sizing-content min-h-11 w-full rounded-md border border-default bg-surface px-3 py-2 text-base text-primary placeholder:text-muted focus:border-active aria-invalid:border-status-danger ${className}`}
      {...props}
    />
  );
});
