import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { APP_MESSAGES_ID } from '../messages/app-id';

const copy = APP_MESSAGES_ID.landing;

const primaryLink =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-center text-sm font-bold text-white shadow-[0_8px_24px_rgba(176,74,106,0.24)] transition-colors hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700';
const secondaryLink =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e8dce1] bg-white px-6 py-3 text-center text-sm font-semibold text-[#3a2931] transition-colors hover:border-[#ef91af] hover:bg-[#fff5f8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700';

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#fff9f6] text-[#24171e]">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {APP_MESSAGES_ID.common.skipToContent}
      </a>
      <header className="sticky top-0 z-40 border-b border-[#f1e8ec] bg-[#fff9f6]/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-[68px] max-w-7xl flex-wrap items-center gap-x-5 px-4 py-2 sm:px-6 lg:px-8">
          <BrandMark href="/" />
          <nav
            aria-label={copy.navigationLabel}
            className="ml-auto flex items-center gap-1 sm:gap-2"
          >
            <a
              href="#cara-kerja"
              className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#4a3a42] hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:inline-flex"
            >
              {copy.workLink}
            </a>
            <Link href="/masuk" className={secondaryLink}>
              {copy.loginLink}
            </Link>
            <Link href="/daftar" className={`${primaryLink} hidden sm:inline-flex`}>
              {copy.registerLink}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="mb-6 inline-flex rounded-full bg-[#fce6ee] px-4 py-2 text-sm font-bold text-[#842644]">
              {copy.hero.eyebrow}
            </p>
            <h1 className="max-w-3xl text-balance font-serif text-4xl leading-tight font-semibold text-[#24171e] sm:text-5xl lg:text-[54px]">
              {copy.hero.title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#4a3a42] sm:text-lg">
              {copy.hero.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/daftar" className={primaryLink}>
                {copy.hero.primaryAction}
              </Link>
              <a href="#cara-kerja" className={secondaryLink}>
                {copy.hero.secondaryAction}
              </a>
            </div>
          </div>

          <div
            aria-label={copy.hero.previewLabel}
            className="relative mx-auto w-full max-w-lg overflow-hidden rounded-3xl border border-[#e8dce1] bg-white p-6 shadow-[0_18px_48px_rgba(36,23,30,0.12)] sm:p-8"
          >
            <div
              aria-hidden="true"
              className="absolute -top-16 -right-12 h-40 w-40 rounded-full bg-[#fce6ee]"
            />
            <div className="relative space-y-4">
              {[copy.hero.previewStart, copy.hero.previewMiddle, copy.hero.previewEnd].map(
                (label, index) => (
                  <div key={label} className="flex items-center gap-4 rounded-2xl bg-[#fff9f6] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fce6ee] text-sm font-extrabold text-[#842644]">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-[#3a2931]">{label}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          id="cara-kerja"
          aria-labelledby="workflow-title"
          className="scroll-mt-24 border-y border-[#f1e8ec] bg-white"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="text-center">
              <h2 id="workflow-title" className="font-serif text-3xl font-semibold sm:text-4xl">
                {copy.workflow.title}
              </h2>
              <p className="mt-3 text-[#76656d]">{copy.workflow.description}</p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {copy.workflow.steps.map((step) => (
                <li
                  key={step.number}
                  className="rounded-2xl border border-[#e8dce1] bg-[#fff9f6] p-5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fce6ee] text-sm font-extrabold text-[#842644]">
                    {step.number}
                  </span>
                  <h3 className="mt-4 font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#76656d]">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="final-cta-title"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="rounded-3xl bg-brand-900 px-5 py-12 text-center text-white sm:px-12 sm:py-14">
            <h2
              id="final-cta-title"
              className="text-balance font-serif text-3xl font-semibold sm:text-4xl"
            >
              {copy.finalCta.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-[#f7c6d6]">
              {copy.finalCta.description}
            </p>
            <Link
              href="/daftar"
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-7 py-3 font-bold text-brand-900 hover:bg-[#fce6ee] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-white"
            >
              {copy.finalCta.action}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#f1e8ec]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BrandMark compact />
            <span className="text-sm text-[#76656d]">{APP_MESSAGES_ID.brand.tagline}</span>
          </div>
          <nav aria-label={copy.footer.navigationLabel} className="flex flex-wrap gap-2">
            <Link
              href="/privasi"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#76656d] hover:bg-white hover:text-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              {copy.footer.privacy}
            </Link>
            <Link
              href="/ketentuan"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#76656d] hover:bg-white hover:text-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              {copy.footer.terms}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
