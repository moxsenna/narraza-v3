import 'server-only';
import { cookies, headers } from 'next/headers';
import type { ValidatedSession } from '@narraza/db';
import { getAuth } from './service';

const SESSION_COOKIE = 'narraza_session';
export const PENDING_VERIFY_COOKIE = 'narraza_pending_verify';
export const PENDING_RESET_COOKIE = 'narraza_pending_reset';
const PENDING_TTL_SECONDS = 15 * 60;

function cookieBase(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase(getAuth().isProd), expires: expiresAt });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Validate the session cookie against the DB (also slides idle expiry). */
export async function getCurrentUser(): Promise<ValidatedSession | null> {
  const token = await currentSessionToken();
  if (!token) return null;
  return getAuth().sessions.validateSession(token);
}

/** Two-step confirm: the GET route stashes the raw token in a short-lived
 * httpOnly cookie so a link-prefetching bot's GET can't consume it — only the
 * subsequent POST does. */
export async function setPendingToken(cookieName: string, token: string): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName, token, { ...cookieBase(getAuth().isProd), maxAge: PENDING_TTL_SECONDS });
}

export async function takePendingToken(cookieName: string): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value ?? null;
  if (value) jar.delete(cookieName);
  return value;
}

/** First hop of X-Forwarded-For (dev sees a placeholder). Real client-IP trust
 * is a reverse-proxy concern configured in staging (M7). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? '0.0.0.0';
}
