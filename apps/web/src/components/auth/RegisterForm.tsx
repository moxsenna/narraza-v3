'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormError, FormNotice, SubmitButton, TextField } from './fields';

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initialFormState);

  if (state.status === 'success') {
    return (
      <FormNotice message="Cek emailmu — kami sudah mengirim tautan verifikasi. Buka tautannya untuk mengaktifkan akunmu." />
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Alamat email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Kata sandi"
        name="password"
        type="password"
        autoComplete="new-password"
        required
      />
      <TextField
        label="Ulangi kata sandi"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
      />
      <FormError message={state.status === 'error' ? state.message : undefined} />
      <SubmitButton>Buat akun</SubmitButton>
      <p className="text-center text-sm text-neutral-600">
        Sudah punya akun?{' '}
        <Link href="/masuk" className="font-semibold text-brand-700 hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}
