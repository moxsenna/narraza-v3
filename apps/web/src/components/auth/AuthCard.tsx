import type { ReactNode } from 'react';

// Shared server-rendered shell for auth screens. Visual polish + real design
// tokens land in M6; this keeps a consistent, centered card for M0.
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">Narraza</p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-brand-900">{title}</h1>
      {subtitle ? (
        <p className="mt-2 mb-6 text-neutral-600">{subtitle}</p>
      ) : (
        <div className="mb-6" />
      )}
      {children}
    </main>
  );
}
