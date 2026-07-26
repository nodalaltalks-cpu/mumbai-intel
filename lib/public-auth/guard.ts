import "server-only";
import { redirect } from "next/navigation";
import { getPublicSession, type PublicSessionPayload } from "./session";

/** Guards a page/layout that requires a signed-in public user. */
export async function requirePublicSession(next?: string): Promise<PublicSessionPayload> {
  const session = await getPublicSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}
