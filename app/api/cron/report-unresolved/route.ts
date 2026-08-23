import { NextResponse, type NextRequest } from "next/server";
import { notifyUnresolvedReports } from "@/lib/notifications";
import { verifyCronSecret } from "@/lib/verify-cron-secret";

/**
 * Vercel Cron hits this daily. Same CRON_SECRET check as
 * app/api/cron/ingest/route.ts — Vercel auto-attaches
 * `Authorization: Bearer <CRON_SECRET>` when that env var is set.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await notifyUnresolvedReports();
  return NextResponse.json(result);
}
