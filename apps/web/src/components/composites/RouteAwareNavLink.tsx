'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function RouteAwareNavLink({
  href,
  children,
  className,
  activeClassName,
  match = 'exact',
}: {
  href: string;
  children: ReactNode;
  className: string;
  activeClassName: string;
  match?: 'exact' | 'prefix';
}) {
  const pathname = usePathname();
  const active = pathname === href || (match === 'prefix' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${className}${active ? ` ${activeClassName}` : ''}`}
    >
      {children}
    </Link>
  );
}
