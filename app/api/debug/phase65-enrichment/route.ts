import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/guard";
import { runPhase65EnrichmentPass } from "@/lib/actions/phase65Enrichment";

/**
 * Phase 65 — temporary, admin-gated debug route. Exists ONLY because a
 * genuine, reproducible client-side issue in this dev session prevented
 * every Server Action click (both pre-existing ones like ReviewQueueList's
 * "Enrich Project", and this phase's own debug runner) from ever reaching
 * the server, confirmed via zero server-side request logs across many
 * attempts, fresh tabs, and a full .next cache clear. This route calls the
 * EXACT SAME existing function (runPhase65EnrichmentPass, itself only a thin
 * wrapper around enrichProjectAction/decideFieldAutomation/
 * acceptEnrichmentFieldAction) through a plain HTTP handler instead, which
 * uses a completely different invocation path than the RSC Server Action
 * wiring that was failing. Same auth gate (requireAdminSession), same
 * pipeline, same audit trail -- only the transport differs.
 */
export async function GET() {
  await requireAdminSession();
  const targetStagingIds = [
    "cmtfnfcsl000704k027n1ouz0", // Godrej Skyshore
    "cmtfnfbpj000104k014z7nk0o", // Linkbay Residences
    "cmtfnfc2x000304k0yy573lnj", // Gurukrupa Ekam
    "cmtfnfcfs000504k0i32fsu16", // Labharti Labh Sapphire
  ];
  const results = await runPhase65EnrichmentPass(targetStagingIds);
  return NextResponse.json(results);
}
