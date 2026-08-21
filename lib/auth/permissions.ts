import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "./session";
import { isAdmin } from "./guard";
import { type PermissionKey } from "./permission-constants";

export { PERMISSION_GROUPS, ALL_PERMISSION_KEYS, isValidPermissionKey, type PermissionKey } from "./permission-constants";

/**
 * Checks a specific permission for the current session, re-reading isActive
 * and permissions fresh from the database rather than trusting the signed
 * session cookie -- the cookie is a 7-day JWT with role baked in at login
 * time (see lib/auth/token.ts), so it would otherwise take up to 7 days for
 * a permission change or a "disable employee" action to actually take
 * effect. ADMIN always passes without a permissions-array check ("Founder/
 * Admin ALWAYS remains the highest authority").
 */
export async function hasPermission(session: SessionPayload, key: PermissionKey): Promise<boolean> {
  if (isAdmin(session.role)) return true;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { isActive: true, permissions: true } });
  if (!user || !user.isActive) return false;
  return user.permissions.includes(key);
}

/** Throws (for a Server Action to propagate as an inline error) when the session lacks `key`. Fetches the user once. */
export async function requirePermission(session: SessionPayload, key: PermissionKey): Promise<void> {
  if (!(await hasPermission(session, key))) {
    throw new Error("Forbidden: you don't have permission to do this. Ask your admin to grant it.");
  }
}
