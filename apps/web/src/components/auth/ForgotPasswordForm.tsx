'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordResetAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormNotice, SubmitButton, TextField } from './fields';

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState);

  if (state.status === 'success') {
    return (
      <FormNotice message="Jika email itu terdaftar, kami sudah mengirim tautan untuk mengatur ulang kata sandi. Cek kotak masukmu." />
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Alamat email" name="email" type="email" autoComplete="email" required />
      <SubmitButton>Kirim tautan reset</SubmitButton>
      <p className="text-center text-sm text-neutral-600">
        <Link href="/masuk" className="font-semibold text-brand-700 hover:underline">
          Kembali ke masuk
        </Link>
      </p>
    </form>
  );
}
