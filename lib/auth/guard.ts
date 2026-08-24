import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "./session";

export function canMutate(role: UserRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

/**
 * Re-verifies `isActive` and `role` fresh from the database instead of
 * trusting the signed session cookie -- the cookie is a 7-day JWT with role
 * baked in at login time (lib/auth/token.ts), so without this a deactivated
 * or demoted employee would keep their old access for up to 7 days (the same
 * staleness problem lib/auth/permissions.ts's hasPermission() already solves
 * for fine-grained permissions). Returns the session with `role` overwritten
 * by the current DB value, or null if the account is gone/deactivated.
 */
export async function verifyActiveSession(session: SessionPayload): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { isActive: true, role: true } });
  if (!user || !user.isActive) return null;
  return { ...session, role: user.role };
}

/**
 * Guards a page/layout: redirects to login when there is no valid, active
 * session. Deliberately does not clear the cookie here -- Next.js only
 * allows mutating cookies from a Server Action or Route Handler, not from a
 * Server Component render (this runs from layout.tsx). The stale cookie is
 * harmless: every subsequent request re-runs this same fresh isActive check,
 * so it can never grant access, and the real logout action already clears
 * it properly.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const active = await verifyActiveSession(session);
  if (!active) redirect("/admin/login");
  return active;
}

/**
 * Guards a Server Action: throws when the session is missing, the account is
 * deactivated, or the (freshly re-checked) role can't mutate data. Server
 * Actions are POST endpoints in their own right — proxy.ts matchers do not
 * protect them, so every action must check this independently.
 */
export async function requireMutateSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const active = await verifyActiveSession(session);
  if (!active) throw new Error("Not authenticated");
  if (!canMutate(active.role)) throw new Error("Forbidden: your role cannot modify data");
  return active;
}

/** Guards a Server Action that only requires being signed in and active (any role) — e.g. changing your own password. */
export async function requireAnySession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const active = await verifyActiveSession(session);
  if (!active) throw new Error("Not authenticated");
  return active;
}

export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const active = await verifyActiveSession(session);
  if (!active) throw new Error("Not authenticated");
  if (!isAdmin(active.role)) throw new Error("Forbidden: admin role required");
  return active;
}
