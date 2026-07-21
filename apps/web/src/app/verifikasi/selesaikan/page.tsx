import Link from 'next/link';
import { cookies } from 'next/headers';
import { AuthCard } from '../../../components/auth/AuthCard';
import { ConfirmVerificationForm } from '../../../components/auth/ConfirmVerificationForm';
import { PENDING_VERIFY_COOKIE } from '../../../server/auth/session';

export default async function SelesaikanVerifikasiPage() {
  const hasPending = (await cookies()).has(PENDING_VERIFY_COOKIE);

  if (!hasPending) {
    return (
      <AuthCard
        title="Tautan tidak berlaku"
        subtitle="Tautan verifikasi sudah tidak berlaku atau sudah dipakai."
      >
        <Link href="/masuk" className="font-semibold text-brand-700 hover:underline">
          Kembali ke masuk
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verifikasi email" subtitle="Satu langkah lagi untuk mengaktifkan akunmu.">
      <ConfirmVerificationForm />
    </AuthCard>
  );
}
