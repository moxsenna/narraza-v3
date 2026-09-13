import { NextResponse, type NextRequest } from 'next/server';
import { loadWebEnv } from '@narraza/shared/env/web';
import { PENDING_VERIFY_COOKIE, setPendingToken } from '../../../server/auth/session';

// GET target of the verification email link. Stashes the token in a short-lived
// httpOnly cookie and redirects to the confirm page (clean URL, no token in
// history). The token is only consumed by the subsequent POST.
//
// The redirect MUST use APP_URL, not req.url: behind a reverse proxy/tunnel
// req.url can carry the internal origin (e.g. localhost:5400), which would
// send the user's browser to an unreachable address.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');
  if (token) await setPendingToken(PENDING_VERIFY_COOKIE, token);
  const appHost = new URL(loadWebEnv().APP_URL).host;
  const proto =
    req.headers.get('x-forwarded-proto') ??
    (appHost === req.nextUrl.host ? req.nextUrl.protocol.replace(':', '') : 'https');
  const host = req.headers.get('x-forwarded-host') ?? appHost;
  const origin = `${proto}://${host}`;
  return NextResponse.redirect(new URL('/verifikasi/selesaikan', origin));
}
