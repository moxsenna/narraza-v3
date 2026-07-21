'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormError, SubmitButton, TextField } from './fields';
import { ResendVerificationForm } from './ResendVerificationForm';

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialFormState);
  const unverified = state.status === 'error' && state.code === 'EMAIL_NOT_VERIFIED';

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="Alamat email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Kata sandi"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="text-right">
        <Link
          href="/lupa-password"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          Lupa kata sandi?
        </Link>
      </div>
      <FormError message={state.status === 'error' ? state.message : undefined} />
      {unverified ? <ResendVerificationForm /> : null}
      <SubmitButton>Masuk</SubmitButton>
      <p className="text-center text-sm text-neutral-600">
        Belum punya akun?{' '}
        <Link href="/daftar" className="font-semibold text-brand-700 hover:underline">
          Daftar
        </Link>
      </p>
    </form>
  );
}
