import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/auth/guard";
import { PILOT_PROJECTS } from "@/lib/enrichment/pilotProjects";
import Phase61PilotRunner from "@/app/admin/components/Phase61PilotRunner";

export const metadata: Metadata = { title: "Phase 61 Auto-Accept Pilot (debug) — NoDalalTalks Admin" };
export const dynamic = "force-dynamic";

/**
 * Phase 61 — a small, deliberately unlinked developer/debug page (not added
 * to AdminSidebar) that exists ONLY to give a real, authenticated admin
 * session a way to invoke `runAutoAcceptPilotDryRun`/`runAutoAcceptPilotRealWrite`
 * (lib/actions/autoAcceptPilot.ts). Server Actions can only be called from
 * inside the app, never from an external script, so this page is the
 * smallest safe integration point for validating the controlled 10-project
 * pilot -- not a general-purpose automation control panel. Session-gated the
 * SAME way every other admin page already is, via the (dashboard) layout's
 * own requireSession(); this page additionally requires the stricter ADMIN
 * role (not just any mutate-capable session) since it can perform real
 * writes across all 10 pilot projects at once.
 */
export default async function Phase61PilotPage() {
  await requireAdminSession();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Phase 61 — Controlled Auto-Accept Pilot (debug)</h1>
        <p className="text-sm text-muted">
          Locked to the exact 10 Phase 59B-reviewed projects. Dry-run computes decisions only; Real Write calls the existing
          `acceptEnrichmentFieldAction` for every AUTO_ACCEPT field. Not linked from the admin sidebar — this is a validation tool, not a
          production control.
        </p>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {PILOT_PROJECTS.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
      <Phase61PilotRunner />
    </div>
  );
}
