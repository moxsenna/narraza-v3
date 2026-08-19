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
    <main className="flex min-h-screen items-center bg-canvas py-12">
      <Container size="form">
        <Stack gap={6}>
          <BrandMark href="/" />
          <Card className="mx-auto w-full max-w-md">
            <h1 className="font-serif text-3xl font-bold text-primary">{title}</h1>
            {subtitle ? (
              <p className="mt-2 mb-6 text-secondary">{subtitle}</p>
            ) : (
              <div className="mb-6" />
            )}
            {children}
          </Card>
        </Stack>
      </Container>
    </main>
  );
}
