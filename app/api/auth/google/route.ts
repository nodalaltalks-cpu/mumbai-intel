import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl, isGoogleSignInConfigured } from "@/lib/public-auth/google";

export const OAUTH_STATE_COOKIE_NAME = "mi_oauth_state";

/** Only same-origin relative paths are ever accepted as a post-login redirect target — rejects absolute/protocol-relative URLs to prevent open-redirect via `next`. */
export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  if (!isGoogleSignInConfigured()) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(url);
  }

  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const state = crypto.randomBytes(16).toString("base64url");
  const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;

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
