'use client';
import { useActionState } from 'react';
import { completeResetAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormError, SubmitButton, TextField } from './fields';

export function NewPasswordForm() {
  const [state, action] = useActionState(completeResetAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField
        label="Kata sandi baru"
        name="password"
        type="password"
        autoComplete="new-password"
        required
      />
      <TextField
        label="Ulangi kata sandi baru"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
      />
      <FormError message={state.status === 'error' ? state.message : undefined} />
      <SubmitButton>Simpan kata sandi baru</SubmitButton>
    </form>
  );
}
