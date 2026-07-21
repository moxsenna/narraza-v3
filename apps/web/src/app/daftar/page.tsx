import { redirect } from 'next/navigation';
import { AuthCard } from '../../components/auth/AuthCard';
import { RegisterForm } from '../../components/auth/RegisterForm';
import { getCurrentUser } from '../../server/auth/session';

export default async function DaftarPage() {
  if (await getCurrentUser()) redirect('/app');
  return (
    <AuthCard title="Buat akun" subtitle="Mulai membangun ceritamu bersama Narra.">
      <RegisterForm />
    </AuthCard>
  );
}
