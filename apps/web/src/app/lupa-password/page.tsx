import { AuthCard } from '../../components/auth/AuthCard';
import { ForgotPasswordForm } from '../../components/auth/ForgotPasswordForm';

export default function LupaPasswordPage() {
  return (
    <AuthCard
      title="Lupa kata sandi"
      subtitle="Masukkan emailmu. Jika terdaftar, kami kirim tautan untuk membuat kata sandi baru."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
