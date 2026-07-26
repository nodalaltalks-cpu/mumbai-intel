import "server-only";
import crypto from "crypto";

/**
 * Public-user session token — same HMAC-signed-cookie shape as
 * lib/auth/token.ts (proven, dependency-free), but its own cookie name,
 * secret and payload so it can never be confused with a founder-admin
 * session. Founder auth and public auth are two independent systems that
 * happen to share a design, not one system with two roles.
 */

export const PUBLIC_SESSION_COOKIE_NAME = "mi_public_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — consumer sessions outlive admin ones by design

export interface PublicSessionPayload {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.PUBLIC_SESSION_SECRET;
  if (!secret) throw new Error("PUBLIC_SESSION_SECRET is not set");
  return secret;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
}

export function createPublicSessionToken(payload: Omit<PublicSessionPayload, "exp">): string {
  const full: PublicSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyPublicSessionToken(token: string | undefined | null): PublicSessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PublicSessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const PUBLIC_SESSION_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;
