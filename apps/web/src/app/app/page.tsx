import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../server/auth/session';
import { logoutAction } from '../../server/auth/actions';

// Minimal authenticated landing to prove the W0.4 flow end-to-end. The real app
// shell (header, sidebar, dashboard states) is W0.5 / M6.
export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/masuk');

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Narraza</p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-brand-900">Kamu sudah masuk</h1>
      <p className="mt-3 text-neutral-600">
        Masuk sebagai <span className="font-semibold text-neutral-900">{user.email}</span>. Shell
        aplikasi dan dashboard dibangun berikutnya (W0.5).
      </p>
      <form action={logoutAction} className="mt-8">
        <button
          type="submit"
          className="h-11 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          Keluar
        </button>
      </form>
    </main>
  );
}
