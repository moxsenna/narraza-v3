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
        <div className="ml-auto lg:hidden">
          <PublicMobileMenu links={links} />
        </div>
      </div>
    </header>
  );
}
