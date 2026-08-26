'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { resendVerificationAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { Button, Input } from '../primitives';
import { FormError, FormNotice } from './fields';

function ResendSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" className="min-h-10" disabled={pending}>
      {pending ? 'Mengirim…' : 'Kirim ulang'}
    </Button>
  );
}

// Small inline resend used on the login screen when an account is unverified.
// The email is read from the sibling login email field via a hidden mirror is
// overkill for M0; instead it submits its own email input.
export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  if (state.status === 'success') {
    return <FormNotice message="Tautan verifikasi baru sudah dikirim. Cek emailmu." />;
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-sm bg-surface-soft p-3">
      <p className="text-sm text-secondary">Belum menerima tautan verifikasi?</p>
      <div className="flex gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="Email untuk kirim ulang"
          className="min-h-10 flex-1"
        />
        <ResendSubmitButton />
      </div>
      <FormError message={state.status === 'error' ? state.message : undefined} />
    </form>
  );
}
