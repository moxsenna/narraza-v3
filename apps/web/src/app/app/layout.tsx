import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppHeader } from '../../components/composites/AppHeader';
import { makeShellAccountViewModel } from '../../lib/frontend/view-model';
import { APP_MESSAGES_ID } from '../../messages/app-id';
import { logoutAction } from '../../server/auth/actions';
import { getCurrentUser } from '../../server/auth/session';
import { getCreditSummaryViewForUser } from '../../server/domain/generation';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/masuk');

  // Same CreditSummaryView source as /app/kredit (D6): one snapshot contract
  // for the header chip and the credit page. The session above is the single
  // shell auth authority; the loader only takes the authenticated userId.
  const credit = await getCreditSummaryViewForUser(user.userId);

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-primary">
      <a
        href="#app-main-content"
        className="fixed top-2 left-2 z-[var(--z-overlay)] -translate-y-20 rounded-md bg-surface px-4 py-3 font-semibold text-brand-strong shadow-lg focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
      >
        {APP_MESSAGES_ID.common.skipToContent}
      </a>
      <AppHeader
        account={makeShellAccountViewModel(user.email)}
        logoutAction={logoutAction}
        credit={credit}
      />
      <div id="app-main-content">{children}</div>
    </div>
  );
}
