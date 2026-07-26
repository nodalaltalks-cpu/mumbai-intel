import "server-only";
import { cookies } from "next/headers";
import {
  createPublicSessionToken,
  PUBLIC_SESSION_COOKIE_NAME,
  PUBLIC_SESSION_MAX_AGE_SECONDS,
  verifyPublicSessionToken,
  type PublicSessionPayload,
} from "./token";

export type { PublicSessionPayload };

export async function setPublicSessionCookie(payload: { userId: string; email: string; name: string | null; image: string | null }) {
  const token = createPublicSessionToken(payload);
  const store = await cookies();
  store.set(PUBLIC_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearPublicSessionCookie() {
  const store = await cookies();
  store.delete(PUBLIC_SESSION_COOKIE_NAME);
}

export async function getPublicSession(): Promise<PublicSessionPayload | null> {
  const store = await cookies();
  const token = store.get(PUBLIC_SESSION_COOKIE_NAME)?.value;
  return verifyPublicSessionToken(token);
}
