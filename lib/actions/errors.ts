import { Prisma } from "@prisma/client";

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
      return "Record not found — it may have already been deleted.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
