import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// There is one login page for everyone now (/login), which redirects ADMIN
// accounts to /admin after signing in. This route only exists so old
// bookmarks/links to /admin/login keep working.
export default async function AdminLoginRedirect() {
  const session = await getSession();
  redirect(session ? "/admin" : "/login");
}
