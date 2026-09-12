import type { ReactNode } from 'react';

export type TabItem = {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly badge?: string | undefined;
};

export function Tabs({
  label,
  tabs,
  activeKey,
  className = '',
}: {
  label: string;
  tabs: readonly TabItem[];
  activeKey: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`flex gap-1 overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <a
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-bold ${
              active
                ? 'bg-brand-soft text-brand-strong'
                : 'text-secondary hover:bg-surface-soft hover:text-primary'
            }`}
          >
            {tab.label}
            {tab.badge ? (
              <span
                aria-label={tab.badge}
                className="inline-flex min-h-6 items-center rounded-pill bg-surface px-2 text-xs font-bold text-secondary"
              >
                {tab.badge}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

export function TabPanel({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div role="tabpanel" aria-labelledby={labelledBy} tabIndex={0}>
      {children}
    </div>
  );
}
