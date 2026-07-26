import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Records an admin mutation for the Activity Feed. Best-effort: a logging
 * failure must never fail the mutation it's describing.
 */
export async function logAudit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string
): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { actorId, action, entityType, entityId } });
  } catch (error) {
    console.error("[audit] failed to record", action, entityType, entityId, error);
  }
}
