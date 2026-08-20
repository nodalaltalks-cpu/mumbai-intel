import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";
import { REFERRAL_COOKIE_MAX_AGE_SECONDS, REFERRAL_COOKIE_NAME } from "@/lib/referral-constants";

export const config = {
  matcher: ["/admin/:path*", "/"],
};

// Page-level gate only. Server Actions are their own POST endpoints and are
// NOT covered by this matcher — each one calls requireMutateSession() itself.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Referral first-touch capture: a Server Component render can't write
  // cookies (see lib/analytics/session-id.ts's peek/create split for the
  // same constraint), so this has to happen here rather than in app/page.tsx
  // itself. First-touch-wins: never overwrites an already-set cookie, so a
  // later plain (no ?ref=) visit or a second referral link doesn't reassign
  // credit for a signup that happens much later.
  if (pathname === "/") {
    const ref = request.nextUrl.searchParams.get("ref");
    if (ref && !request.cookies.get(REFERRAL_COOKIE_NAME)) {
      // Cookie value is "code|channel" -- channel comes from the share
      // link's own ?src= (set by ShareReferralCard, e.g. "whatsapp" /
      // "copy_link" / "native_share"), empty when unknown (a bare /?ref=
      // link typed/forwarded manually).
      const src = request.nextUrl.searchParams.get("src") ?? "";
      const response = NextResponse.next();
      response.cookies.set(REFERRAL_COOKIE_NAME, `${ref}|${src}`, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
        path: "/",
      });
      return response;
    }
    return NextResponse.next();
  }

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
