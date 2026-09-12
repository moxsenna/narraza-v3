import type { ReactNode } from 'react';
import { BrandMark } from '../BrandMark';
import { Card, Container, Stack } from '../primitives';

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
    <main className="relative flex min-h-screen items-center overflow-hidden bg-canvas py-8 sm:py-12">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56 bg-brand-soft/70" />
      <Container size="form" className="relative">
        <Stack gap={6}>
          <div className="mx-auto">
            <BrandMark href="/" />
          </div>
          <Card className="mx-auto w-full max-w-md p-5 shadow-md sm:p-7">
            <h1 className="text-2xl font-bold text-primary">{title}</h1>
            {subtitle ? (
              <p className="mt-2 mb-6 leading-7 text-secondary">{subtitle}</p>
            ) : (
              <div className="mb-6" />
            )}
            {children}
          </Card>
          <p className="mx-auto max-w-md text-center text-xs leading-5 text-muted">
            Ceritamu tetap milikmu. Narraza membantu, kamu yang memutuskan.
          </p>
        </Stack>
      </Container>
    </main>
  );
}
