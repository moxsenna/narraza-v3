import Link from 'next/link';
import { cookies } from 'next/headers';
import { AuthCard } from '../../../components/auth/AuthCard';
import { NewPasswordForm } from '../../../components/auth/NewPasswordForm';
import { PENDING_RESET_COOKIE } from '../../../server/auth/session';

export default async function ResetBaruPage() {
  const hasPending = (await cookies()).has(PENDING_RESET_COOKIE);

  if (!hasPending) {
    return (
      <AuthCard
        title="Tautan tidak berlaku"
        subtitle="Tautan reset sudah tidak berlaku atau sudah dipakai."
      >
        <Link href="/lupa-password" className="font-semibold text-brand-700 hover:underline">
          Minta tautan baru
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Kata sandi baru" subtitle="Buat kata sandi baru untuk akunmu.">
      <NewPasswordForm />
    </AuthCard>
  );
}
