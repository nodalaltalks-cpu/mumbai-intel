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

/**
 * Constraint name (as it appears in the DB, e.g. "PublicUser_phoneCountryCode_phone_key")
 * -> a specific, actionable message. Extend this as new user-facing unique
 * constraints are added; anything not listed here still gets a real,
 * field-derived message from `describeConstraint` below, never the fully
 * generic fallback.
 */
const KNOWN_CONSTRAINT_MESSAGES: Record<string, string> = {
  PublicUser_phoneCountryCode_phone_key: "This phone number is already registered to another account.",
  PublicUser_email_key: "This email address is already registered.",
  // Gmail dot/plus-insensitive collision (lib/email-canonicalize.ts) -- from the
  // user's point of view this is the exact same situation as PublicUser_email_key,
  // so it gets the identical message rather than leaking the canonicalization detail.
  PublicUser_canonicalEmail_key: "This email address is already registered.",
  PublicUser_referralCode_key: "That referral code is already in use.",
};

/** Best-effort fallback for a unique-constraint name that isn't in the table above -- turns e.g. "Project_slug_key" into "A record with this slug already exists." rather than a fully generic message. */
function describeConstraint(constraintName: string): string {
  const withoutSuffix = constraintName.replace(/_key$/, "").replace(/_pkey$/, "");
  const parts = withoutSuffix.split("_");
  const fieldPart = parts.length > 1 ? parts.slice(1).join(" ") : withoutSuffix;
  const humanized = fieldPart
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return `A record with this ${humanized} already exists.`;
}

/**
 * Postgres SQLSTATE (what the Neon HTTP driver adapter -- @prisma/adapter-neon's
 * PrismaNeonHttp, this app's only Prisma runtime -- actually sets as
 * `error.code`) alongside the classic-engine's own normalized "P2xxx" codes.
 * Live-verified against this exact adapter: a real unique-constraint violation
 * lands as `error instanceof Prisma.PrismaClientKnownRequestError` with
 * `code: "23505"` (Postgres's own SQLSTATE for unique_violation) and an EMPTY
 * `meta` (no `target` array) -- NOT `code: "P2002"` with `meta.target`, which
 * is what this function originally (and incorrectly, for this adapter) only
 * checked for. That meant every unique-constraint violation in this app --
 * not just phone, every one -- silently fell through to "Something went
 * wrong. Please try again.", discarding the one piece of information (WHICH
 * constraint) that would have told the user why retrying can never succeed.
 * The real constraint name is only recoverable from `error.message`.
 */
const SQLSTATE_UNIQUE_VIOLATION = "23505";
const SQLSTATE_FOREIGN_KEY_VIOLATION = "23503";
const SQLSTATE_NOT_NULL_VIOLATION = "23502";

export function friendlyPrismaError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === SQLSTATE_UNIQUE_VIOLATION) {
      const targetFromMeta = (error.meta?.target as string[] | undefined)?.join(", ");
      if (targetFromMeta) return `A record with this ${targetFromMeta} already exists.`;
      const constraintMatch = /unique constraint "([^"]+)"/.exec(error.message);
      const constraintName = constraintMatch?.[1];
      if (constraintName) return KNOWN_CONSTRAINT_MESSAGES[constraintName] ?? describeConstraint(constraintName);
      return "A record with this value already exists.";
    }
    if (error.code === "P2003" || error.code === "P2014" || error.code === SQLSTATE_FOREIGN_KEY_VIOLATION) {
      return "This record is still referenced by other data and can't be deleted or changed.";
    }
    if (error.code === "P2025") {
      return "Record not found, it may have already been deleted.";
    }
    if (error.code === SQLSTATE_NOT_NULL_VIOLATION) {
      return "A required field is missing.";
    }
  }
  // Anything else -- log the real error server-side (Vercel function logs) and
  // return a generic message instead of ever forwarding error.message to the client.
  console.error("[friendlyPrismaError] unclassified error:", error);
  return "Something went wrong. Please try again.";
}
