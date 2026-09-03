import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { PHASE61A_VALIDATION_PROJECTS } from "@/lib/enrichment/pilotProjects";
import Phase61PilotRunner from "@/app/admin/components/Phase61PilotRunner";

export const metadata: Metadata = { title: "Phase 61A Real-Write Validation (debug) — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * Phase 61A — validates a genuine GREEN_NEW -> AUTO_ACCEPT -> real write ->
 * AuditLog flow against 2-3 candidates OUTSIDE the Phase 59B ten (which
 * already had every Tier A field accepted and therefore only ever produce
 * no-op results). Same debug-only, admin-gated, unlinked pattern as Phase
 * 61's own page — reuses the exact same Phase61PilotRunner component,
 * parameterized with a different, still-hardcoded, still-tiny project list.
 */
export default async function Phase61aValidationPage() {
  await requireAdminSession();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Phase 61A — Real-Write Validation (debug)</h1>
        <p className="text-sm text-muted">
          3 candidates outside the Phase 59B ten, selected because their RERA/price fields were never accepted and show zero conflicts. Proves a genuine
          new AUTO_ACCEPT write end-to-end.
        </p>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {PHASE61A_VALIDATION_PROJECTS.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
      <Phase61PilotRunner projects={PHASE61A_VALIDATION_PROJECTS} />
    </div>
  );
}
