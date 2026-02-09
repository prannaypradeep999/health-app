const { NextResponse } = require("next/server");

export function middleware(request) {
  console.log("[MIDDLEWARE] Request to:", request.nextUrl.pathname);
  console.log("[MIDDLEWARE] Cookies:", Object.fromEntries(request.cookies));
  
  const sessionId = request.cookies.get("auth_session")?.value;
  const userId = request.cookies.get("user_id")?.value;
  const guestSession = request.cookies.get("guest_session")?.value;
  
  console.log("[MIDDLEWARE] sessionId:", sessionId);
  console.log("[MIDDLEWARE] userId:", userId); 
  console.log("[MIDDLEWARE] guestSession:", guestSession);
  
  const isLoggedIn = \!\!(sessionId || (userId && userId \!== "undefined" && userId \!== "null"));
  const hasSession = isLoggedIn || \!\!guestSession;
  
  console.log("[MIDDLEWARE] isLoggedIn:", isLoggedIn);
  console.log("[MIDDLEWARE] hasSession:", hasSession);
  
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (\!hasSession) {
      console.log("[MIDDLEWARE] No session, redirecting to survey");
      return NextResponse.redirect(new URL("/survey", request.url));
    }
    console.log("[MIDDLEWARE] Session found, allowing dashboard access");
  }
  
  return NextResponse.next();
}
