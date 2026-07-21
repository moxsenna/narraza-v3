import { APP_MESSAGES_ID } from '../../messages/app-id';

export default function AppHome() {
  const copy = APP_MESSAGES_ID.dashboard;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-10 lg:py-16">
      <section aria-labelledby="dashboard-empty-title" className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fce6ee]">
          <span aria-hidden="true" className="h-7 w-7 rounded-[7px_7px_14px_7px] bg-brand-500" />
        </div>
        <p className="mt-6 text-xs font-extrabold tracking-[0.14em] text-brand-700">
          {copy.eyebrow}
        </p>
        <h1
          id="dashboard-empty-title"
          className="mt-2 text-balance font-serif text-3xl font-semibold sm:text-4xl"
        >
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#4a3a42]">
          {copy.description}
        </p>

        <div className="mt-9 grid gap-4 text-left sm:grid-cols-3">
          {copy.paths.map((path) => (
            <button
              key={path.title}
              type="button"
              disabled
              aria-disabled="true"
              aria-label={`${path.title} — ${copy.unavailableLabel}`}
              className="min-h-44 cursor-not-allowed rounded-2xl border border-[#e8dce1] bg-white p-5 text-left opacity-75"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#3a2931]">{path.title}</span>
                {'soon' in path && path.soon ? (
                  <span className="rounded-full bg-[#f8f1f4] px-2.5 py-1 text-xs font-bold text-[#6f4b68]">
                    {copy.soon}
                  </span>
                ) : null}
              </span>
              <span className="mt-3 block text-sm leading-6 text-[#76656d]">
                {path.description}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
