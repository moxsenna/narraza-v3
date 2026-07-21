// Shared form-action state. Kept out of the 'use server' module because such
// files may only export async functions.
export interface FormState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  /** machine-readable code so the UI can branch (e.g. show resend on EMAIL_NOT_VERIFIED) */
  code?: string;
}

export const initialFormState: FormState = { status: 'idle' };
