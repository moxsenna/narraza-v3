import Link from 'next/link';
import { APP_MESSAGES_ID } from '../../messages/app-id';

export type BrandMarkProps = {
  href?: string;
  compact?: boolean;
  className?: string;
};

function Mark({ compact }: { compact: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`${compact ? 'h-4 w-4 rounded-[4px_4px_8px_4px]' : 'h-[22px] w-[22px] rounded-[6px_6px_12px_6px]'} shrink-0 bg-action-primary`}
      />
      <span
        className={`${compact ? 'text-sm' : 'text-xl'} font-extrabold tracking-tight text-brand-ink`}
      >
        {APP_MESSAGES_ID.brand.name}
      </span>
    </>
  );
}

export function BrandMark({ href, compact = false, className = '' }: BrandMarkProps) {
  const classes = `inline-flex items-center gap-2 ${href ? 'min-h-11 rounded-lg px-1' : ''} ${className}`;

  if (href) {
    return (
      <Link
        href={href}
        aria-label={
          href === '/app' ? APP_MESSAGES_ID.brand.dashboardLabel : APP_MESSAGES_ID.brand.homeLabel
        }
        className={classes}
      >
        <Mark compact={compact} />
      </Link>
    );
  }

  return (
    <span className={classes} aria-label={APP_MESSAGES_ID.brand.name}>
      <Mark compact={compact} />
    </span>
  );
}
