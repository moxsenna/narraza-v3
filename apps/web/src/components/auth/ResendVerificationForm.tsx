'use client';
import { useActionState } from 'react';
import { resendVerificationAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormError, FormNotice } from './fields';

// Small inline resend used on the login screen when an account is unverified.
// The email is read from the sibling login email field via a hidden mirror is
// overkill for M0; instead it submits its own email input.
export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  if (state.status === 'success') {
    return <FormNotice message="Tautan verifikasi baru sudah dikirim. Cek emailmu." />;
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
      <p className="text-sm text-neutral-600">Belum menerima tautan verifikasi?</p>
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="Email untuk kirim ulang"
          className="h-10 flex-1 rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/30"
        />
        <button
          type="submit"
          className="h-10 rounded-lg border border-brand-700 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-500/10"
        >
          Kirim ulang
        </button>
      </div>
      <FormError message={state.status === 'error' ? state.message : undefined} />
    </form>
  );
}
