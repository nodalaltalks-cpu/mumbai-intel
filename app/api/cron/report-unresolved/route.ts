import { NextResponse, type NextRequest } from "next/server";
import { notifyUnresolvedReports } from "@/lib/notifications";

/**
 * Vercel Cron hits this daily. Same CRON_SECRET check as
 * app/api/cron/ingest/route.ts — Vercel auto-attaches
 * `Authorization: Bearer <CRON_SECRET>` when that env var is set.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await notifyUnresolvedReports();
  return NextResponse.json(result);
}
