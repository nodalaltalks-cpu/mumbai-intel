import { NextResponse, type NextRequest } from "next/server";
import { capturePlatformMetricSnapshot } from "@/lib/platform-metrics/snapshot";
import { checkAndNotifyPlatformLoad } from "@/lib/platform-metrics/alerts";
import { verifyCronSecret } from "@/lib/verify-cron-secret";

/**
 * Vercel Cron hits this hourly (vercel.json). Same CRON_SECRET pattern as
 * the other three crons (ingest, report-unresolved, storage-snapshot).
 * Captures one PlatformMetricSnapshot (Part 11/12 history + peak tracking)
 * and fires a Founder-only warning if load has crossed WATCH+ (Part 9/10).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { snapshot, prunedCount } = await capturePlatformMetricSnapshot();
  await checkAndNotifyPlatformLoad({
    loadState: snapshot.loadState,
    primaryBottleneck: snapshot.primaryBottleneck,
    bottleneckReason: snapshot.bottleneckReason,
    activeNow: snapshot.activeNow,
  });

  return NextResponse.json({ snapshot, prunedHeartbeats: prunedCount });
}
