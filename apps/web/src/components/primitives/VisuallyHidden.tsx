import type { ReactNode } from 'react';

export function VisuallyHidden({
  as = 'span',
  children,
}: {
  as?: 'span' | 'p';
  children: ReactNode;
}) {
  const Tag = as;
  return <Tag className="sr-only">{children}</Tag>;
}
