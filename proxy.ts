import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

export const config = {
  matcher: ["/admin/:path*"],
};

// Page-level gate only. Server Actions are their own POST endpoints and are
// NOT covered by this matcher — each one calls requireMutateSession() itself.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /admin/login itself is just a redirect stub (see app/admin/(auth)/login/page.tsx)
  // kept for old bookmarks — the one real login form lives at /login.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
