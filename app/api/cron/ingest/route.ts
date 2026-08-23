import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runIngestBatch } from "@/lib/ingestion/runner";
import { verifyCronSecret } from "@/lib/verify-cron-secret";

// Requests the longest function duration Vercel's plan allows — a citywide
// sync can take a while even with batched reads (see MAX_WRITES_PER_RUN in
// lib/ingestion/runner.ts). Vercel silently caps this to the plan's ceiling
// if 300 isn't available, so it's safe to declare regardless of plan tier.
export const maxDuration = 300;

/**
 * Vercel Cron hits this on the schedule in vercel.json. Setting CRON_SECRET
 * makes Vercel auto-attach `Authorization: Bearer <CRON_SECRET>` to the
 * request — checked here so the endpoint can't be triggered by anyone who
 * just finds its public URL.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await prisma.ingestSource.findMany({ where: { enabled: true }, select: { key: true } });
  const results: Record<string, { ok: boolean; error?: string }> = {};

  for (const source of sources) {
    try {
      await runIngestBatch(source.key, "scheduled");
      results[source.key] = { ok: true };
    } catch (error) {
      results[source.key] = { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  return NextResponse.json({ ranSources: Object.keys(results).length, results });
}
