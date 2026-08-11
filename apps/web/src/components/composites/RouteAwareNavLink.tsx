'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

export type RouteNavigationActivationHandler = (event: MouseEvent<HTMLAnchorElement>) => void;

function isSameTabNavigationActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.target.toLocaleLowerCase('en-US');

  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (target === '' || target === '_self')
  );
}

export function RouteAwareNavLink({
  href,
  children,
  className,
  activeClassName,
  match = 'exact',
  onNavigateActivation,
}: {
  href: string;
  children: ReactNode;
  className: string;
  activeClassName: string;
  match?: 'exact' | 'prefix';
  onNavigateActivation?: RouteNavigationActivationHandler;
}) {
  const pathname = usePathname();
  const active = pathname === href || (match === 'prefix' && pathname.startsWith(`${href}/`));

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isSameTabNavigationActivation(event)) onNavigateActivation?.(event);
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${className}${active ? ` ${activeClassName}` : ''}`}
      {...(onNavigateActivation ? { onClick: handleClick } : {})}
    >
      {children}
    </Link>
  );
}
