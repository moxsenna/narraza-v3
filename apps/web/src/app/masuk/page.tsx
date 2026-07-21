import { redirect } from 'next/navigation';
import { AuthCard } from '../../components/auth/AuthCard';
import { LoginForm } from '../../components/auth/LoginForm';
import { FormNotice } from '../../components/auth/fields';
import { getCurrentUser } from '../../server/auth/session';

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getCurrentUser()) redirect('/app');
  const { reset } = await searchParams;
  return (
    <AuthCard title="Masuk" subtitle="Lanjutkan menulis ceritamu.">
      {reset ? (
        <div className="mb-4">
          <FormNotice message="Kata sandi berhasil diubah. Silakan masuk dengan kata sandi barumu." />
        </div>
      ) : null}
      <LoginForm />
    </AuthCard>
  );
}
