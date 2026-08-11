import { LinkButton } from '../primitives';
import { BrandMark } from './BrandMark';
import { PublicMobileMenu } from './PublicMobileMenu';

const links = [
  ['Cara kerja', '#cara-kerja'],
  ['Fitur', '#fitur'],
  ['Untuk siapa', '#untuk-siapa'],
  ['Kredit', '#kredit'],
] as const;

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-default bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[var(--container-marketing)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" />
        <nav aria-label="Navigasi utama" className="ml-auto hidden items-center gap-1 lg:flex">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-secondary hover:bg-surface"
            >
              {label}
            </a>
          ))}
          <LinkButton href="/masuk" variant="secondary">
            Masuk
          </LinkButton>
          <LinkButton href="/daftar">Mulai gratis</LinkButton>
        </nav>
        <div className="public-mobile-menu-enhanced ml-auto lg:hidden">
          <PublicMobileMenu links={links} />
        </div>
        <noscript>
          <style>{'.public-mobile-menu-enhanced{display:none}'}</style>
          <nav
            aria-label="Navigasi utama mobile tanpa JavaScript"
            className="ml-auto flex flex-wrap justify-end gap-1 lg:hidden"
          >
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-secondary"
              >
                {label}
              </a>
            ))}
            <a
              href="/masuk"
              className="inline-flex min-h-11 items-center rounded-md border border-default bg-surface px-3 text-sm font-semibold text-primary"
            >
              Masuk
            </a>
            <a
              href="/daftar"
              className="inline-flex min-h-11 items-center rounded-md bg-action-primary px-3 text-sm font-semibold text-brand-ink"
            >
              Mulai gratis
            </a>
          </nav>
        </noscript>
      </div>
    </header>
  );
}
