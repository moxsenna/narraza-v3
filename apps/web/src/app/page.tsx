import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { PublicHeader } from '../components/composites/PublicHeader';
import { Card, LinkButton } from '../components/primitives';
import { APP_MESSAGES_ID } from '../messages/app-id';

const copy = APP_MESSAGES_ID.landing;
const sectionContainer =
  'mx-auto max-w-[var(--container-marketing)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8';

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-primary">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[var(--z-overlay)] -translate-y-20 rounded-md bg-surface px-4 py-3 font-semibold text-brand-ink shadow-lg focus-visible:translate-y-0"
      >
        {APP_MESSAGES_ID.common.skipToContent}
      </a>
      <PublicHeader />

      <main id="main-content">
        <section className="mx-auto grid max-w-[var(--container-marketing)] items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="mb-6 inline-flex rounded-full bg-brand-soft px-4 py-2 text-sm font-bold text-brand-strong">
              {copy.hero.eyebrow}
            </p>
            <h1 className="max-w-3xl text-balance font-serif text-4xl leading-tight font-semibold text-primary sm:text-5xl lg:text-[54px]">
              {copy.hero.title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-secondary sm:text-lg">
              {copy.hero.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/daftar" className="px-6 py-3">
                {copy.hero.primaryAction}
              </LinkButton>
              <a
                href="#cara-kerja"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-default bg-surface px-6 py-3 text-sm font-semibold text-primary hover:border-active hover:bg-brand-soft"
              >
                {copy.hero.secondaryAction}
              </a>
            </div>
          </div>

          <div
            aria-label={copy.hero.previewLabel}
            className="relative mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-default bg-surface p-6 shadow-lg sm:p-8"
          >
            <div
              aria-hidden="true"
              className="absolute -top-16 -right-12 h-40 w-40 rounded-full bg-brand-soft"
            />
            <div className="relative space-y-4">
              {[copy.hero.previewStart, copy.hero.previewMiddle, copy.hero.previewEnd].map(
                (label, index) => (
                  <div key={label} className="flex items-center gap-4 rounded-lg bg-canvas p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-strong">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-primary">{label}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          id="masalah"
          aria-labelledby="problem-title"
          className="scroll-mt-24 border-y border-default bg-surface"
        >
          <div className={sectionContainer}>
            <div className="text-center">
              <h2 id="problem-title" className="font-serif text-3xl font-semibold sm:text-4xl">
                {copy.problemSection.title}
              </h2>
              <p className="mt-3 text-secondary">{copy.problemSection.description}</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {copy.problemCards.map((item) => (
                <Card key={item.title} className="bg-canvas">
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 leading-7 text-secondary">{item.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="cara-kerja" aria-labelledby="workflow-title" className="scroll-mt-24">
          <div className={sectionContainer}>
            <div className="text-center">
              <h2 id="workflow-title" className="font-serif text-3xl font-semibold sm:text-4xl">
                {copy.workflow.title}
              </h2>
              <p className="mt-3 text-secondary">{copy.workflow.description}</p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {copy.workflow.steps.map((step) => (
                <li key={step.number} className="rounded-lg border border-default bg-surface p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-strong">
                    {step.number}
                  </span>
                  <h3 className="mt-4 font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="fitur"
          aria-labelledby="feature-title"
          className="scroll-mt-24 border-y border-default bg-surface"
        >
          <div className={sectionContainer}>
            <h2
              id="feature-title"
              className="text-center font-serif text-3xl font-semibold sm:text-4xl"
            >
              {copy.featureSection.title}
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {copy.featureCards.map((item) => (
                <Card key={item.title}>
                  <div aria-hidden="true" className="mb-4 h-9 w-9 rounded-md bg-brand-soft" />
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 leading-7 text-secondary">{item.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="untuk-siapa" aria-labelledby="persona-title" className="scroll-mt-24">
          <div className={sectionContainer}>
            <h2
              id="persona-title"
              className="text-center font-serif text-3xl font-semibold sm:text-4xl"
            >
              {copy.personaSection.title}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {copy.personaCards.map((item) => (
                <Card key={item.title}>
                  <h3 className="font-bold text-brand-strong">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-secondary">{item.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section
          id="kredit"
          aria-labelledby="credit-title"
          className="scroll-mt-24 border-y border-default bg-surface"
        >
          <div className={`${sectionContainer} max-w-5xl text-center`}>
            <h2 id="credit-title" className="font-serif text-3xl font-semibold sm:text-4xl">
              {copy.creditSection.title}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl leading-7 text-secondary">
              {copy.creditSection.description}
            </p>
            <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
              {copy.creditTierCards.map((item) => (
                <Card
                  key={item.title}
                  className={`relative ${'emphasized' in item && item.emphasized ? 'border-2 border-active' : ''}`}
                >
                  {'badge' in item ? (
                    <span className="mb-4 inline-flex rounded-full bg-action-primary px-3 py-1 text-xs font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-secondary">{item.description}</p>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">{copy.creditDisclosure}</p>
          </div>
        </section>

        <section id="kepercayaan" aria-labelledby="trust-title">
          <div className={sectionContainer}>
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="trust-title" className="font-serif text-3xl font-semibold sm:text-4xl">
                {copy.trust.title}
              </h2>
              <p className="mt-3 leading-7 text-secondary">{copy.trust.description}</p>
            </div>
            <dl className="mx-auto mt-8 grid max-w-5xl gap-4 lg:grid-cols-3">
              {copy.trust.faq.map((item) => (
                <div
                  key={item.question}
                  className="rounded-lg border border-default bg-surface p-6"
                >
                  <dt className="font-bold">{item.question}</dt>
                  <dd className="mt-2 text-sm leading-6 text-secondary">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          id="cta-final"
          aria-labelledby="final-cta-title"
          className="mx-auto max-w-[var(--container-marketing)] scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <div className="rounded-xl bg-brand-ink px-5 py-12 text-center text-white sm:px-12 sm:py-14">
            <h2
              id="final-cta-title"
              className="text-balance font-serif text-3xl font-semibold sm:text-4xl"
            >
              {copy.finalCta.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-brand-200">
              {copy.finalCta.description}
            </p>
            <Link
              href="/daftar"
              className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-surface px-7 py-3 font-bold text-brand-ink hover:bg-brand-soft"
            >
              {copy.finalCta.action}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-default">
        <div className="mx-auto flex max-w-[var(--container-marketing)] flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <BrandMark compact />
            <span className="text-sm text-muted">{APP_MESSAGES_ID.brand.tagline}</span>
          </div>
          <nav aria-label={copy.footer.navigationLabel} className="flex flex-wrap gap-2">
            <Link
              href="/privasi"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-brand-strong"
            >
              {copy.footer.privacy}
            </Link>
            <Link
              href="/ketentuan"
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-brand-strong"
            >
              {copy.footer.terms}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
