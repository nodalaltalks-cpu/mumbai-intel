import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import Phase65EnrichmentRunner from "@/app/admin/components/Phase65EnrichmentRunner";

export const metadata: Metadata = { title: "Phase 65 Enrichment (debug) — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

// The 4 strongest publication candidates identified by Phase 65's read-only audit:
// genuinely UNDER_CONSTRUCTION, RESIDENTIAL, Mumbai-located, richest existing data.
const TARGET_STAGING_IDS = [
  "cmtfnfcsl000704k027n1ouz0", // Godrej Skyshore
  "cmtfnfbpj000104k014z7nk0o", // Linkbay Residences
  "cmtfnfc2x000304k0yy573lnj", // Gurukrupa Ekam
  "cmtfnfcfs000504k0i32fsu16", // Labharti Labh Sapphire
];

export default async function Phase65EnrichmentPage() {
  await requireAdminSession();
  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Phase 65 — Enrichment Pass (debug)</h1>
        <p className="mt-1 text-sm text-muted">
          Fresh-enriches each target, auto-accepts only AUTO_ACCEPT fields via the existing pipeline, reports everything else.
        </p>
      </div>
      <Phase65EnrichmentRunner stagingRecordIds={TARGET_STAGING_IDS} />
    </div>
  );
}
