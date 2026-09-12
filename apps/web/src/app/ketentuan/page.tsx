import Link from 'next/link';
import { BrandMark } from '../../components/BrandMark';
import { APP_MESSAGES_ID } from '../../messages/app-id';

export default function TermsPage() {
  const copy = APP_MESSAGES_ID.legal.terms;

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-primary">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto flex min-h-[68px] max-w-5xl items-center px-4 sm:px-6">
          <BrandMark href="/" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="inline-flex rounded-pill bg-brand-soft px-4 py-2 text-sm font-bold text-brand-strong">
          {APP_MESSAGES_ID.legal.status}
        </p>
        <h1 className="mt-6 font-serif text-4xl font-semibold">{copy.title}</h1>
        <p className="mt-5 text-base leading-8 text-secondary">{copy.description}</p>
        <div className="mt-8 space-y-7">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-primary">{section.heading}</h2>
              <p className="mt-2 text-base leading-8 text-secondary">{section.body}</p>
            </section>
          ))}
        </div>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-md border border-default bg-surface px-5 font-semibold text-brand-strong hover:border-active hover:bg-brand-soft"
        >
          {APP_MESSAGES_ID.common.backHome}
        </Link>
      </main>
    </div>
  );
}
