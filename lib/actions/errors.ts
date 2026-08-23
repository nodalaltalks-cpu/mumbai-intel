import { Prisma } from "@prisma/client";

/**
 * Per-row fan-out for a bulk update — NOT `prisma.<model>.updateMany()`.
 * The Neon HTTP adapter (`@prisma/adapter-neon`'s `PrismaNeonHttp`) rejects
 * `updateMany` with "Transactions are not supported in HTTP mode": Prisma's
 * query engine runs it as a multi-statement interactive transaction
 * internally even for a single batch of same-shape updates, and the HTTP
 * adapter has no transaction support (by design — it avoids a persistent
 * connection so Neon's autosuspend can still kill idle connections between
 * requests). Plain per-row `update()` calls stay single statements, same
 * fix already used by reorderProjectImageAction in lib/actions/images.ts.
 * `allSettled` (not `Promise.all`) so one missing/already-changed row can't
 * abort the whole batch — mirroring `updateMany`'s original
 * skip-non-matches behavior instead of failing the entire bulk action.
 */
export async function updateManyByRow<T>(ids: string[], updateOne: (id: string) => Promise<T>): Promise<number> {
  const results = await Promise.allSettled(ids.map(updateOne));
  return results.filter((r) => r.status === "fulfilled").length;
}

export function friendlyPrismaError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "value";
      return `A record with this ${target} already exists.`;
    }
    if (error.code === "P2003" || error.code === "P2014") {
      return "This record is still referenced by other data and can't be deleted or changed.";
    }
    if (error.code === "P2025") {
      return "Record not found, it may have already been deleted.";
    }
  }
  // Anything else -- including errors from the Neon HTTP driver adapter, which don't always
  // land as a PrismaClientKnownRequestError the way classic-engine errors do, so a raw
  // constraint-violation/table-name message can otherwise slip past every case above and
  // reach the browser verbatim. Log the real error server-side (Vercel function logs) and
  // return a generic message instead of ever forwarding error.message to the client.
  console.error("[friendlyPrismaError] unclassified error:", error);
  return "Something went wrong. Please try again.";
}
