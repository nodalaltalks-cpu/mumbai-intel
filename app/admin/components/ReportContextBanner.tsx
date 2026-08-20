"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveReportAction } from "@/lib/actions/reports";
import type { ReportContext } from "@/lib/admin-queries";

const CATEGORY_LABEL: Record<string, string> = {
  PROJECT_DETAILS: "Project details",
  PRICING: "Pricing",
  CONFIGURATION: "Configuration",
  LOCATION: "Location",
  CONSTRUCTION: "Construction / possession",
  AMENITIES: "Amenities",
  BUILDER: "Builder information",
  TRANSACTION: "Transaction information",
  OTHER: "Other",
};

/** Shown at the top of an entity's edit page when it was opened via a report's "Apply change" link — keeps the admin's context ("I am editing this because of THIS report") visible while they make the actual edit through the entity's own validated form below, instead of a separate auto-writer. */
export default function ReportContextBanner({ report }: { report: ReportContext }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  function markResolved() {
    startTransition(async () => {
      const result = await resolveReportAction(report.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-sm border border-accent/40 bg-accent/5 p-4">
      <p className="text-[10px] font-mono uppercase tracking-wide text-accent">Editing due to reported issue</p>
      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{report.entityName}</p>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted">Reported field / category</dt>
          <dd className="text-foreground">{report.category ? (CATEGORY_LABEL[report.category] ?? report.category) : "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-muted">Reported by</dt>
          <dd className="text-foreground">{report.reporterEmail ?? "Anonymous"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Issue described</dt>
          <dd className="text-foreground">{report.issue}</dd>
        </div>
        {report.suggestedValue ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">User suggested</dt>
            <dd className="text-accent">{report.suggestedValue}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 text-[11px] text-muted">Make the correction in the form below, save it, then mark this report resolved.</p>
      {error ? <p className="mt-2 text-xs text-negative">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={markResolved}
          className="rounded-sm border border-positive/40 bg-positive/10 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-positive hover:bg-positive/20 disabled:opacity-60"
        >
          Mark report resolved
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-sm border border-border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wide text-muted hover:border-accent hover:text-accent"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
