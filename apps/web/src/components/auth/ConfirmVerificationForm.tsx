'use client';
import { useActionState } from 'react';
import { completeVerificationAction } from '../../server/auth/actions';
import { initialFormState } from '../../server/auth/form-state';
import { FormError, SubmitButton } from './fields';

// Step 2 of verification: the token is already in the pending cookie; this POST
// consumes it and signs the user in.
export function ConfirmVerificationForm() {
  const [state, action] = useActionState(completeVerificationAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.status === 'error' ? state.message : undefined} />
      <SubmitButton>Verifikasi & masuk</SubmitButton>
    </form>
  );
}
