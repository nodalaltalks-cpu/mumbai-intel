import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";
import { TRASH_REAUTH_COOKIE, TRASH_REAUTH_COOKIE_PATH } from "./trash-reauth-constants";

/**
 * Short-lived, separate step-up credential for Trash (Section 18) — not a
 * new password store. It just re-checks the founder's existing password
 * hash (same verifyPassword() used by ChangePasswordForm/settings.ts) and,
 * on success, stamps a short-TTL signed cookie using the same HMAC scheme
 * as the main session token (lib/auth/token.ts), scoped to one userId so it
 * can never be replayed for a different account.
 *
 * Scoped to path=/admin/trash (not "/") so the browser itself never sends it
 * on any other admin page — the founder being logged into Admin elsewhere
 * must never count as still being authorized for Trash. That alone only
 * stops the cookie being *sent* elsewhere though; it doesn't stop it from
 * still being valid and silently re-accepted if the founder returns to
 * Trash within the TTL after visiting other pages. proxy.ts is what
 * actually deletes the cookie server-side the instant a request lands on
 * any admin page OTHER than /admin/trash — that's what makes "leave Trash,
 * come back" require the password again, not just this path scoping. The
 * TTL below is then a ceiling for "stayed on the Trash page and did
 * nothing," not the primary expiry mechanism.
 */
const TRASH_REAUTH_TTL_SECONDS = 10 * 60;

interface TrashReauthPayload {
  userId: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

export async function grantTrashReauth(userId: string): Promise<void> {
  const payload: TrashReauthPayload = { userId, exp: Math.floor(Date.now() / 1000) + TRASH_REAUTH_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${body}.${sign(body)}`;
  const store = await cookies();
  store.set(TRASH_REAUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TRASH_REAUTH_COOKIE_PATH,
    maxAge: TRASH_REAUTH_TTL_SECONDS,
  });
}

export async function clearTrashReauth(): Promise<void> {
  const store = await cookies();
  store.delete({ name: TRASH_REAUTH_COOKIE, path: TRASH_REAUTH_COOKIE_PATH });
}

export async function hasValidTrashReauth(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(TRASH_REAUTH_COOKIE)?.value;
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  const expected = sign(body);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TrashReauthPayload;
    if (payload.userId !== userId) return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Throws when the current founder hasn't re-authenticated recently — the server-side gate on top of the page-level UI gate, called from the irreversible actions themselves (Section 19: permanent delete requires Founder re-authentication) so it can't be bypassed by calling the action directly. */
export async function requireTrashReauth(userId: string): Promise<void> {
  if (!(await hasValidTrashReauth(userId))) {
    throw new Error("Re-authentication required. Return to Trash and confirm your password before permanently deleting.");
  }
}
