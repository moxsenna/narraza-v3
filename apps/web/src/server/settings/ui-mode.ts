'use server';

import { redirect } from 'next/navigation';

import { createUpdateUiMode } from '@narraza/application';
import { authorizeActiveUser } from '@narraza/application';
import { getCurrentUser } from '../auth/session';
import { getUnitOfWork } from '../domain/uow';

/** Persists the caller's own experience mode (D3: exactly Pemula/Mahir). */
export async function setUiModeAction(formData: FormData): Promise<void> {
  const mode = String(formData.get('mode') ?? '');
  const back = '/app/pengaturan';

  const authed = await authorizeActiveUser(async () => {
    const session = await getCurrentUser();
    if (!session) return null;
    return { id: session.userId, status: session.status, email: session.email };
  });
  if (!authed.ok || !authed.value) redirect(back);

  const update = createUpdateUiMode(getUnitOfWork());
  await update({ ownerUserId: authed.value.id, mode });
  redirect(back);
}
