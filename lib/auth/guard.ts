import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { getSession, type SessionPayload } from "./session";

export function canMutate(role: UserRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

/** Guards a page/layout: redirects to login when there is no valid session. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * Guards a Server Action: throws when the session is missing or the role can't
 * mutate data. Server Actions are POST endpoints in their own right — proxy.ts
 * matchers do not protect them, so every action must check this independently.
 */
export async function requireMutateSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!canMutate(session.role)) throw new Error("Forbidden: your role cannot modify data");
  return session;
}

/** Guards a Server Action that only requires being signed in (any role) — e.g. changing your own password. */
export async function requireAnySession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  if (!isAdmin(session.role)) throw new Error("Forbidden: admin role required");
  return session;
}
