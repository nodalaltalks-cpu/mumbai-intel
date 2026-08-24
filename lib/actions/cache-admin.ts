"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";

export interface CacheClearState {
  error?: string;
  success?: boolean;
}

/**
 * Founder-only fallback cache refresh (Sections 5-10). Every normal admin
 * mutation already revalidates its own targeted paths (lib/cache.ts's
 * "Automatic Update Engine") — this is the manual "something looks stale"
 * escape hatch, not something the founder should need day to day.
 *
 * Scope, by design (see the inspection report): every public page renders
 * force-dynamic, so there is no server Data/Route Cache to purge beyond the
 * client-side Router Cache and the one ISR route (/sitemap.xml, 1h). A root
 * `revalidatePath("/", "layout")` invalidates the Router Cache for the whole
 * app in one call — the smallest primitive that covers everything without
 * hand-enumerating every route, matching Section 6's "smallest safe
 * invalidation mechanism, don't rebuild the caching architecture."
 *
 * Never touches the database, uploaded files, or analytics history — this
 * function contains no delete/update calls against Prisma or Cloudinary.
 */
export async function clearApplicationCacheAction(): Promise<CacheClearState> {
  let session;
  try {
    session = await requireAdminSession();
  } catch {
    return { error: "You don't have permission to do this." };
  }

  try {
    revalidatePath("/", "layout");
    // Belt-and-braces: /sitemap.xml is a MetadataRoute handler (its own 1h
    // ISR), not a normal page — revalidated explicitly in case the root
    // layout-scoped call above doesn't reach it the same way.
    revalidatePath("/sitemap.xml");
  } catch (error) {
    console.error("[cache-admin] revalidation failed:", error);
    return { error: "Could not refresh the cache. Please try again." };
  }

  await logAudit(session.userId, "cache.clear", "System", "application", { after: { scope: "all" } });

  return { success: true };
}
