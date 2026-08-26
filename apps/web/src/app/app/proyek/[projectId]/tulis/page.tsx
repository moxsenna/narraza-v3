import Link from 'next/link';
import { notFound } from 'next/navigation';

import { resolveProjectWritingContext } from '../../../../../lib/server/capability-resolvers/project-context';

export default async function ProjectTulisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await resolveProjectWritingContext(projectId);
  if (context.kind === 'not_found') notFound();

  const outlineHref = `/app/proyek/${encodeURIComponent(projectId)}/outline`;
  const projectHref = `/app/proyek/${encodeURIComponent(projectId)}`;

  if (context.kind === 'blocked') {
    const outlineRequired = context.reason === 'OUTLINE_REQUIRED';
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">MENULIS</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
          {outlineRequired ? 'Siapkan rangkaian cerita' : 'Lengkapi rangkaian cerita'}
        </h1>
        <p className="mt-2 text-sm font-semibold text-brand-ink">{context.projectTitle}</p>
        <section className="mt-8 rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
          <p className="text-base leading-7 text-text-secondary">
            {outlineRequired
              ? 'Buat rangkaian cerita terlebih dahulu agar penulisan memiliki arah yang jelas.'
              : 'Tambahkan bagian cerita yang dapat disiapkan untuk penulisan.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={outlineHref}
              className="inline-flex min-h-11 items-center rounded-xl border border-border-active bg-surface px-5 text-sm font-bold text-action-primary"
            >
              {outlineRequired ? 'Buka rangkaian cerita' : 'Tinjau rangkaian cerita'}
            </Link>
            <Link
              href={projectHref}
              className="inline-flex min-h-11 items-center rounded-xl border border-border-default bg-surface px-5 text-sm font-bold text-text-secondary"
            >
              Kembali ke proyek
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">MENULIS</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
        Pilih bagian cerita
      </h1>
      <p className="mt-2 text-sm font-semibold text-brand-ink">{context.projectTitle}</p>

      <ul className="mt-8 space-y-3">
        {context.choices.map((choice, index) => (
          <li
            key={`${choice.title}-${choice.ordinal ?? 'tanpa-urutan'}-${index}`}
            className="rounded-2xl border border-border-default bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {choice.ordinal === undefined ? null : (
                  <p className="text-xs font-semibold text-text-muted">Bagian {choice.ordinal}</p>
                )}
                <p className="mt-1 font-semibold text-text-primary">{choice.title}</p>
              </div>
              <button
                type="button"
                disabled
                className="min-h-11 shrink-0 rounded-xl border border-border-default bg-surface-soft px-4 text-sm font-bold text-text-muted"
              >
                Tulis
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              Penulisan bab belum tersedia dari halaman ini.
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={outlineHref}
          className="inline-flex min-h-11 items-center rounded-xl border border-border-active bg-surface px-5 text-sm font-bold text-action-primary"
        >
          Tinjau rangkaian cerita
        </Link>
        <Link
          href={projectHref}
          className="inline-flex min-h-11 items-center rounded-xl border border-border-default bg-surface px-5 text-sm font-bold text-text-secondary"
        >
          Kembali ke proyek
        </Link>
      </div>
    </main>
  );
}
