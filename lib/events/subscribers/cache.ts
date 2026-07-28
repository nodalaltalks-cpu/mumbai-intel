import "server-only";
import { revalidatePath } from "next/cache";
import { revalidateBuilder, revalidateInfra, revalidateLocality, revalidateProject, revalidateTransaction } from "@/lib/cache";
import { on } from "../bus";

/**
 * Event-driven cache invalidation. Each handler calls the exact same
 * lib/cache.ts function the emitting action used to call directly — this
 * only ever invalidates the paths that entity's revalidate* function already
 * knows about (see lib/cache.ts's own docs on why that's "only affected
 * caches, never unrelated ones"). Nothing here invalidates more broadly than
 * the direct-call version it replaces.
 */

on("ProjectCreated", async (p) => {
  revalidateProject({ id: p.projectId, slug: p.slug });
});

on("ProjectUpdated", async (p) => {
  revalidateProject({ id: p.projectId, slug: p.slug });
});

on("ProjectPublished", async (p) => {
  revalidateProject({ id: p.projectId, slug: p.slug });
});

on("ProjectDeleted", async (p) => {
  revalidateProject({ id: p.projectId, slug: p.slug });
});

on("BuilderUpdated", async (p) => {
  revalidateBuilder({ id: p.builderId, slug: p.slug });
});

on("TransactionImported", async () => {
  revalidateTransaction();
});

on("ReviewApproved", async (p) => {
  if (p.entityType === "Project") revalidateProject();
  else if (p.entityType === "InfraAsset") revalidateInfra();
  else if (p.entityType === "Builder") revalidateBuilder();
  else if (p.entityType === "Locality") revalidateLocality();
  else if (p.entityType === "Transaction") revalidateTransaction();
});

on("MediaUploaded", async (p) => {
  if (p.entityType === "Project") {
    revalidateProject({ id: p.entityId });
    revalidatePath("/admin/images");
  } else if (p.entityType === "Builder") {
    revalidateBuilder({ id: p.entityId });
  } else if (p.entityType === "Locality") {
    revalidateLocality({ id: p.entityId });
  }
});

on("MediaDeleted", async (p) => {
  if (p.entityType === "Project") {
    revalidateProject({ id: p.entityId });
    revalidatePath("/admin/images");
  } else if (p.entityType === "Builder") {
    revalidateBuilder({ id: p.entityId });
  } else if (p.entityType === "Locality") {
    revalidateLocality({ id: p.entityId });
  }
});
