import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth/session";
import { setPublicSessionCookie } from "@/lib/public-auth/session";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/lib/public-auth/google";
import { recordResearchEvent } from "@/lib/analytics/research-events";
import { recalculatePublicUserCompletion } from "@/lib/profile-completion";
import { sendWelcomeEmail } from "@/lib/email";
import { GA_GOOGLE_LOGIN_COOKIE } from "@/lib/analytics/ga";
import { OAUTH_STATE_COOKIE_NAME, sanitizeNextPath } from "../route";

function failure(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  if (!code || !returnedState || !stateCookie) return failure(origin, "google_auth_failed");

  let expected: { state: string; next: string };
  try {
    expected = JSON.parse(stateCookie);
  } catch {
    return failure(origin, "google_auth_failed");
  }
  if (expected.state !== returnedState) return failure(origin, "google_auth_failed");

  try {
    // Must exactly match the redirect_uri sent in app/api/auth/google/route.ts's authorization
    // request (Google validates the token exchange against it too) -- same canonical-origin
    // pin, request origin only as a fallback (local dev).
    const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin;
    const redirectUri = `${canonicalOrigin}/api/auth/google/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    if (!profile.email) return failure(origin, "google_auth_failed");

    // Same "founder table checked first" rule as the email/password path
    // (lib/actions/public-auth.ts's loginAction) — a Google account whose
    // email matches an active founder/admin account signs in as admin
    // instead of being created as a PublicUser. This is why admin Google
    // sign-in previously appeared to do nothing useful: it always logged
    // the founder into the public account system and redirected to the
    // public site instead of /admin.
    const admin = await prisma.user.findUnique({ where: { email: profile.email } });
    if (admin && admin.isActive) {
      await prisma.user.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
      await setSessionCookie({ userId: admin.id, email: admin.email, name: admin.name, role: admin.role });
      const response = NextResponse.redirect(new URL("/admin", origin));
      response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
      return response;
    }

    let user = await prisma.publicUser.findUnique({ where: { googleId: profile.sub } });
    let authEvent: "LOGIN_COMPLETED" | "SIGNUP_COMPLETED" = "LOGIN_COMPLETED";
    if (user) {
      user = await prisma.publicUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } else {
      // A CREDENTIALS account may already own this email — link Google to it
      // rather than erroring, so the same person can sign in either way.
      const existingByEmail = await prisma.publicUser.findUnique({ where: { email: profile.email } });
      if (existingByEmail) {
        user = await prisma.publicUser.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: profile.sub,
            image: existingByEmail.image ?? profile.picture,
            emailVerifiedAt: existingByEmail.emailVerifiedAt ?? new Date(),
            lastLoginAt: new Date(),
          },
        });
      } else {
        user = await prisma.publicUser.create({
          data: {
            name: profile.name,
            email: profile.email,
            googleId: profile.sub,
            image: profile.picture,
            provider: "GOOGLE",
            emailVerifiedAt: profile.email_verified ? new Date() : null,
            lastLoginAt: new Date(),
          },
        });
        authEvent = "SIGNUP_COMPLETED";
      }
    }

    if (authEvent === "SIGNUP_COMPLETED") {
      // Best-effort — a transient Resend failure must never fail an
      // otherwise-successful Google login (this whole handler has one outer
      // catch that treats any thrown error as an auth failure).
      try {
        await sendWelcomeEmail(user.email, user.name);
      } catch (error) {
        console.error("[email] failed to send welcome email:", error);
      }
    }

    await setPublicSessionCookie({ userId: user.id, email: user.email, name: user.name, image: user.image });
    await recordResearchEvent(authEvent, { entityType: "PublicUser", entityId: user.id, metadata: { method: "google" } });
    // Every other writer of a scored field (emailVerifiedAt here) recomputes
    // completion — this was the one path that didn't, so a fresh Google
    // signup under-reported 0% until the user separately touched the
    // profile/preferences form.
    await recalculatePublicUserCompletion(user.id);

    const response = NextResponse.redirect(new URL(sanitizeNextPath(expected.next), origin));
    response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    // Readable client-side (not httpOnly) and short-lived — GoogleLoginPing
    // (mounted in the root layout) fires the GA4 event once on next paint
    // and clears this immediately, since gtag only ever runs in the browser.
    response.cookies.set(GA_GOOGLE_LOGIN_COOKIE, "1", { httpOnly: false, sameSite: "lax", maxAge: 30, path: "/" });
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return failure(origin, "google_auth_failed");
  }
}
