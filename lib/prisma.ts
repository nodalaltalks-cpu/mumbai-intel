import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { recordDbQuery } from "@/lib/platform-metrics/db-metrics";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // HTTP (fetch-based) adapter: every query is a stateless request, so there is
  // no long-lived WebSocket connection for Neon's autosuspend to kill between
  // requests. The app never uses interactive $transaction, so this is safe.
  const adapter = new PrismaNeonHttp(connectionString, {});
  const client = new PrismaClient({ adapter });

  // Platform Capacity Monitoring: real query-duration/error sampling, not a
  // fabricated number — see lib/platform-metrics/db-metrics.ts. A $extends
  // query wrapper is the one place every Prisma call in this app already
  // passes through, so this needs no change at any of the ~200 call sites.
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const start = performance.now();
          try {
            const result = await query(args);
            recordDbQuery(performance.now() - start, true);
            return result;
          } catch (error) {
            recordDbQuery(performance.now() - start, false);
            throw error;
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
