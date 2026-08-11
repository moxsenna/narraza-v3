import type { HTMLAttributes } from 'react';

export function Divider({ className = '', ...props }: HTMLAttributes<HTMLHRElement>) {
  return (
    <hr aria-hidden="true" className={`border-0 border-t border-default ${className}`} {...props} />
  );
}
