import { NextResponse, type NextRequest } from 'next/server';
import { loadWebEnv } from '@narraza/shared/env/web';
import { PENDING_RESET_COOKIE, setPendingToken } from '../../../server/auth/session';

// GET target of the password-reset email link. Same two-step pattern as
// verification: stash token in a pending cookie, redirect to the new-password
// form; the token is consumed only by the POST.
//
// Same APP_URL rule as verifikasi/konfirmasi: req.url can carry the internal
// origin behind a proxy/tunnel.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');
  if (token) await setPendingToken(PENDING_RESET_COOKIE, token);
  const appHost = new URL(loadWebEnv().APP_URL).host;
  const proto =
    req.headers.get('x-forwarded-proto') ??
    (appHost === req.nextUrl.host ? req.nextUrl.protocol.replace(':', '') : 'https');
  const host = req.headers.get('x-forwarded-host') ?? appHost;
  const origin = `${proto}://${host}`;
  return NextResponse.redirect(new URL('/reset-password/baru', origin));
}
