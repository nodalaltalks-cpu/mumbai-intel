import { NextResponse, type NextRequest } from "next/server";
import { captureStorageSnapshot, checkAndNotifyStorageThreshold } from "@/lib/system-health";

/**
 * Vercel Cron hits this daily. Same CRON_SECRET pattern as the other two
 * crons (app/api/cron/ingest, app/api/cron/report-unresolved).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await captureStorageSnapshot();
  await checkAndNotifyStorageThreshold(snapshot.cloudinaryCreditsUsedPercent);

  return NextResponse.json(snapshot);
}
