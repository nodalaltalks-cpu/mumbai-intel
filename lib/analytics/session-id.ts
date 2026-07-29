import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "mi_anon_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Read-only peek — safe to call from a Server Component render (which cannot set cookies). Returns null if the visitor has never triggered a write-capable request (e.g. a brochure download) yet. */
export async function peekAnonSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** Reads or creates the first-party anonymous visitor id. Only callable from a Route Handler or Server Action (where cookies() is writable) — use peekAnonSessionId() from a Server Component. */
export async function getOrCreateAnonSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  store.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR_SECONDS, path: "/" });
  return id;
}
