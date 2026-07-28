import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Recursively converts BigInt/Decimal/Date fields into JSON-safe values so a Prisma row can be stored as AuditLog.before/after. */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    // Prisma's Decimal (decimal.js) — duck-typed rather than imported, since it's
    // only ever produced internally by Prisma, never constructed by this code.
    if ("toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") {
      return (value as { toString(): string }).toString();
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) out[key] = toJsonSafe(val);
    return out;
  }
  return value;
}

/**
 * Records an admin mutation for the Activity Feed and (when `before`/`after`
 * are given) the per-entity History view. Best-effort: a logging failure
 * must never fail the mutation it's describing.
 */
export async function logAudit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  changes?: { before?: unknown; after?: unknown }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        before: changes?.before !== undefined ? (toJsonSafe(changes.before) as Prisma.InputJsonValue) : undefined,
        after: changes?.after !== undefined ? (toJsonSafe(changes.after) as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", action, entityType, entityId, error);
  }
}
