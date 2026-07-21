import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandMark } from '../../components/BrandMark';
import { APP_MESSAGES_ID } from '../../messages/app-id';
import { logoutAction } from '../../server/auth/actions';
import { getCurrentUser } from '../../server/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/masuk');

  const initial = user.email.trim().charAt(0).toLocaleUpperCase('id-ID') || '?';
  const copy = APP_MESSAGES_ID.shell;

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fff9f6] text-[#24171e]">
      <a
        href="#app-main-content"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-white px-4 py-3 font-semibold text-brand-900 shadow-lg focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {APP_MESSAGES_ID.common.skipToContent}
      </a>
      <header className="sticky top-0 z-40 border-b border-[#f1e8ec] bg-white">
        <div className="flex min-h-[68px] min-w-0 items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <BrandMark href="/app" className="shrink-0" />
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="hidden min-h-11 items-center rounded-full border border-[#e8dce1] bg-[#fff9f6] px-4 text-sm font-semibold text-[#6f4b68] sm:inline-flex">
              {copy.creditSoon}
            </span>
            <span
              aria-label={`${copy.avatarLabel}: ${user.email}`}
              title={user.email}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white"
            >
              {initial}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="min-h-11 rounded-xl border border-[#e8dce1] bg-white px-3 text-sm font-semibold text-[#3a2931] hover:border-[#ef91af] hover:bg-[#fff5f8] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:px-4"
              >
                {copy.logout}
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-[#f1e8ec] px-3 py-2 sm:hidden">
          <span className="inline-flex min-h-11 items-center rounded-full border border-[#e8dce1] bg-[#fff9f6] px-4 text-sm font-semibold text-[#6f4b68]">
            {copy.creditSoon}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] min-w-0">
        <aside className="hidden w-64 shrink-0 border-r border-[#f1e8ec] bg-white lg:block">
          <nav
            aria-label={copy.navigationLabel}
            className="sticky top-[68px] max-h-[calc(100vh-68px)] overflow-y-auto px-4 py-6"
          >
            {copy.groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label} className="mb-6">
                <p className="px-3 text-[11px] font-extrabold tracking-[0.12em] text-[#a9979f]">
                  {group.label}
                </p>
                <ul className="mt-2 space-y-1">
                  {group.items.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="flex min-h-11 w-full cursor-not-allowed items-center rounded-xl px-3 text-left text-sm font-medium text-[#8f7f86]"
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <div id="app-main-content" className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
