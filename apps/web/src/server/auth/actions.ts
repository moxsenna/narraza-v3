'use server';
import { redirect } from 'next/navigation';
import { authMessage } from '../../messages/auth-id';
import { getAuth } from './service';
import { type FormState } from './form-state';
import {
  PENDING_RESET_COOKIE,
  PENDING_VERIFY_COOKIE,
  clearSessionCookie,
  currentSessionToken,
  getClientIp,
  setSessionCookie,
  takePendingToken,
} from './session';

const genericError: FormState = { status: 'error', message: authMessage('') };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, 'email');
  const password = str(formData, 'password');
  const confirm = str(formData, 'passwordConfirm');
  if (password !== confirm) {
    return { status: 'error', message: 'Konfirmasi kata sandi tidak cocok.', code: 'MISMATCH' };
  }
  try {
    const res = await getAuth().service.registerAccount({
      email,
      password,
      ctx: { ip: await getClientIp() },
    });
    if (res.ok) return { status: 'success' };
    return {
      status: 'error',
      message: authMessage(res.error.publicMessageCode),
      code: res.error.code,
    };
  } catch {
    return genericError;
  }
}

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData, 'email');
  try {
    const res = await getAuth().service.requestEmailVerification({
      email,
      ctx: { ip: await getClientIp() },
    });
    if (res.ok) return { status: 'success' };
    return {
      status: 'error',
      message: authMessage(res.error.publicMessageCode),
      code: res.error.code,
    };
  } catch {
    return genericError;
  }
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = str(formData, 'email');
  try {
    await getAuth().service.requestPasswordReset({ email, ctx: { ip: await getClientIp() } });
  } catch {
    /* stay generic even on infra errors — never reveal existence */
  }
  return { status: 'success' };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, 'email');
  const password = str(formData, 'password');
  const res = await getAuth().service.login({ email, password, ctx: { ip: await getClientIp() } });
  if (!res.ok) {
    return {
      status: 'error',
      message: authMessage(res.error.publicMessageCode),
      code: res.error.code,
    };
  }
  await setSessionCookie(res.value.sessionToken, res.value.expiresAt);
  redirect('/app'); // redirect() throws a control-flow signal, so it is last
}

export async function completeVerificationAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const token = await takePendingToken(PENDING_VERIFY_COOKIE);
  if (!token) return { status: 'error', message: authMessage('msg.auth.error.invalid_token') };
  const res = await getAuth().service.verifyEmail({ token });
  if (!res.ok) {
    return {
      status: 'error',
      message: authMessage(res.error.publicMessageCode),
      code: res.error.code,
    };
  }
  await setSessionCookie(res.value.sessionToken, res.value.expiresAt);
  redirect('/app');
}

export async function completeResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = str(formData, 'password');
  const confirm = str(formData, 'passwordConfirm');
  if (password !== confirm) {
    return { status: 'error', message: 'Konfirmasi kata sandi tidak cocok.', code: 'MISMATCH' };
  }
  const token = await takePendingToken(PENDING_RESET_COOKIE);
  if (!token) return { status: 'error', message: authMessage('msg.auth.error.invalid_token') };
  const res = await getAuth().service.resetPassword({ token, newPassword: password });
  if (!res.ok) {
    return {
      status: 'error',
      message: authMessage(res.error.publicMessageCode),
      code: res.error.code,
    };
  }
  redirect('/masuk?reset=1');
}

export async function logoutAction(): Promise<void> {
  const token = await currentSessionToken();
  if (token) await getAuth().sessions.revokeSession(token);
  await clearSessionCookie();
  redirect('/masuk');
}
