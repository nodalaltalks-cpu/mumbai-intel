import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { verifyActiveSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// There is one login page for everyone now (/login), which redirects ADMIN
// accounts to /admin after signing in. This route only exists so old
// bookmarks/links to /admin/login keep working.
//
// Must re-verify the session the same way requireSession() does (fresh
// isActive/role from the DB, not just a valid signature) -- otherwise a
// stale-but-cryptographically-valid cookie (deactivated/deleted account)
// bounces here as "not really logged in", gets redirected to /admin by the
// old getSession()-only check below, and the dashboard layout's
// requireSession() immediately redirects back here: an infinite loop.
export default async function AdminLoginRedirect() {
  const session = await getSession();
  const active = session ? await verifyActiveSession(session) : null;
  redirect(active ? "/admin" : "/login");
}
