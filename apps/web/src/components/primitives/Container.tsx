import type { HTMLAttributes } from 'react';

const sizes = {
  marketing: 'max-w-[var(--container-marketing)]',
  product: 'max-w-[var(--container-product)]',
  form: 'max-w-[var(--container-form)]',
  prose: 'max-w-[var(--container-prose)]',
} as const;

export function Container({
  size = 'product',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: keyof typeof sizes }) {
  return (
    <div className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${sizes[size]} ${className}`} {...props} />
  );
}
