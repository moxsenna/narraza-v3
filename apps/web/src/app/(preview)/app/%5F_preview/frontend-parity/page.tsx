import { notFound } from 'next/navigation';

import { resolvePreviewAccess } from '../../../../../lib/server/preview/gate';
import { mapPreviewScenario } from '../../../../../lib/server/preview/map-scenario';
import { PREVIEW_PRESENTATION_FIXTURES } from '../../../../../lib/server/preview/presentation-fixtures';

export const dynamic = 'force-dynamic';

type SearchValue = string | string[] | undefined;

function single(value: SearchValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function FrontendParityPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const query = await searchParams;
  const scenarioKey = single(query.scenario);
  if (!scenarioKey) notFound();

  const projectId = single(query.projectId);
  const access = await resolvePreviewAccess({
    scenarioKey,
    ...(projectId ? { projectId } : {}),
  });
  if (!access) notFound();

  const fixture = PREVIEW_PRESENTATION_FIXTURES[access.scenario.key];
  const presentation = mapPreviewScenario(access.scenario, fixture);

  if (presentation.view === 'kredit') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
          <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">AKUN</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
            Kredit & penggunaan
          </h1>
          <p className="mt-4 text-base leading-7 text-text-secondary">
            Informasi kredit belum tersedia di akunmu saat ini.
          </p>
          <div className="mt-6 rounded-xl border border-border-default bg-status-info-soft p-4">
            <p className="text-sm leading-6 text-status-info">
              Kamu tidak perlu melakukan apa pun untuk sekarang.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="mt-8 min-h-11 rounded-xl border border-border-default bg-surface-soft px-5 text-sm font-bold text-text-muted"
          >
            Kembali ke dashboard
          </button>
        </section>
      </main>
    );
  }

  const outlineRequired = presentation.state === 'OUTLINE_REQUIRED';
  const noChapter = presentation.state === 'NO_CHAPTER_AVAILABLE';

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-extrabold tracking-[0.14em] text-text-muted">MENULIS</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-text-primary sm:text-4xl">
        {outlineRequired
          ? 'Siapkan rangkaian cerita'
          : noChapter
            ? 'Lengkapi rangkaian cerita'
            : 'Pilih bagian cerita'}
      </h1>
      <p className="mt-2 text-sm font-semibold text-brand-ink">{presentation.projectTitle}</p>

      {presentation.state === 'choose' ? (
        <ul className="mt-8 space-y-3">
          {presentation.choices.map((choice, index) => (
            <li
              key={`${choice.title}-${choice.ordinal ?? 'tanpa-urutan'}-${index}`}
              className="rounded-2xl border border-border-default bg-surface p-5"
            >
              {choice.ordinal === undefined ? null : (
                <p className="text-xs font-semibold text-text-muted">Bagian {choice.ordinal}</p>
              )}
              <p className="mt-1 font-semibold text-text-primary">{choice.title}</p>
              <button
                type="button"
                disabled
                className="mt-4 min-h-11 rounded-xl border border-border-default bg-surface-soft px-4 text-sm font-bold text-text-muted"
              >
                Tulis
              </button>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                Penulisan bab belum tersedia dari halaman ini.
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mt-8 rounded-2xl border border-border-default bg-surface p-6 sm:p-8">
          <p className="text-base leading-7 text-text-secondary">
            {outlineRequired
              ? 'Buat rangkaian cerita terlebih dahulu agar penulisan memiliki arah yang jelas.'
              : 'Tambahkan bagian cerita yang dapat disiapkan untuk penulisan.'}
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled
          className="min-h-11 rounded-xl border border-border-default bg-surface-soft px-5 text-sm font-bold text-text-muted"
        >
          {outlineRequired ? 'Buka rangkaian cerita' : 'Tinjau rangkaian cerita'}
        </button>
        <button
          type="button"
          disabled
          className="min-h-11 rounded-xl border border-border-default bg-surface-soft px-5 text-sm font-bold text-text-muted"
        >
          Kembali ke proyek
        </button>
      </div>
    </main>
  );
}
