import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl, isGoogleSignInConfigured } from "@/lib/public-auth/google";
import { sanitizeNextPath } from "@/lib/public-auth/next-path";

export const OAUTH_STATE_COOKIE_NAME = "mi_oauth_state";

export { sanitizeNextPath };

export async function GET(request: NextRequest) {
  if (!isGoogleSignInConfigured()) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const state = crypto.randomBytes(16).toString("base64url");
  // Pinned to one fixed, pre-registered Google Cloud Console redirect URI per environment
  // (NEXT_PUBLIC_APP_URL — the same var lib/actions/public-auth.ts's getSiteUrl() already
  // uses for reset-password links) instead of the request's own origin, which is a fresh,
  // never-registered Vercel preview URL on every single deploy and would otherwise need a
  // new Google Console entry added every time.
  const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  const redirectUri = `${canonicalOrigin}/api/auth/google/callback`;

  const response = NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
