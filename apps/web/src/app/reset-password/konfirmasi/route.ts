import { NextResponse, type NextRequest } from 'next/server';
import { PENDING_RESET_COOKIE, setPendingToken } from '../../../server/auth/session';

// GET target of the password-reset email link. Same two-step pattern as
// verification: stash token in a pending cookie, redirect to the new-password
// form; the token is consumed only by the POST.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');
  if (token) await setPendingToken(PENDING_RESET_COOKIE, token);
  return NextResponse.redirect(new URL('/reset-password/baru', req.url));
}
