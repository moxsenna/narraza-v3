import { NextResponse, type NextRequest } from 'next/server';
import { PENDING_VERIFY_COOKIE, setPendingToken } from '../../../server/auth/session';

// GET target of the verification email link. Stashes the token in a short-lived
// httpOnly cookie and redirects to the confirm page (clean URL, no token in
// history). The token is only consumed by the subsequent POST.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');
  if (token) await setPendingToken(PENDING_VERIFY_COOKIE, token);
  return NextResponse.redirect(new URL('/verifikasi/selesaikan', req.url));
}
