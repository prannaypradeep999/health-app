import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for auth session cookie
  const sessionId = request.cookies.get('auth_session')?.value;
  const userId = request.cookies.get('user_id')?.value;
  const isLoggedIn = !!(sessionId || userId);

  // Also check for guest session (completed survey but not registered)
  const guestSession = request.cookies.get('guest_session')?.value;
  const hasSession = isLoggedIn || !!guestSession;

  // Public routes that don't need auth
  const publicRoutes = ['/survey', '/login', '/register', '/api'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Root path logic
  if (pathname === '/') {
    if (hasSession) {
      // Logged in or has guest session → go to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      // Not logged in → go to survey
      return NextResponse.redirect(new URL('/survey', request.url));
    }
  }

  // Dashboard routes need auth
  if (pathname.startsWith('/dashboard')) {
    if (!hasSession) {
      // No session → redirect to survey (or login if you prefer)
      return NextResponse.redirect(new URL('/survey', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};