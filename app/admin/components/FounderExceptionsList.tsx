import Link from "next/link";
import type { FounderExceptionRow } from "@/lib/enrichment/founderExceptions";
import EmptyState from "@/app/components/ui/EmptyState";

/** "launchDate" -> "Launch Date" -- generic so a future field key never needs a manual label added here. */
function fieldLabel(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export default function FounderExceptionsList({ items }: { items: FounderExceptionRow[] }) {
  if (items.length === 0) {
    return <EmptyState title="No exceptions here" message="Nothing in this view currently needs your attention." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const projectHref = item.projectId ? `/admin/projects/${item.projectId}/edit` : "/admin/data-sync/review";
        return (
          <div key={item.auditId} className="rounded-sm border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={projectHref} className="font-mono text-sm font-semibold text-foreground hover:text-accent">
                  {item.projectName}
                </Link>
                <span className="rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                  {fieldLabel(item.fieldKey)}
                </span>
              </div>
              <span
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                  item.resolved ? "border-positive/40 bg-positive/10 text-positive" : "border-warning/40 bg-warning/10 text-warning"
                }`}
              >
                {item.resolved ? "Resolved" : "Founder Update Required"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="uppercase tracking-wide text-muted">Current value</p>
                <p className="mt-0.5 text-foreground">{displayValue(item.currentValue)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-muted">Why it's missing</p>
                <p className="mt-0.5 text-foreground">{item.reason}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-muted">Sources checked</p>
                <p className="mt-0.5 text-foreground">{item.sourcesChecked.length > 0 ? item.sourcesChecked.join(", ") : "Source not recorded"}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-muted">Last attempt</p>
                <p className="mt-0.5 text-foreground">{item.lastAttemptedSource}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-xs text-foreground">
                <span className="uppercase tracking-wide text-muted">Recommended: </span>
                {item.recommendedFounderAction}
              </p>
              <Link
                href={projectHref}
                className="shrink-0 rounded-sm border border-accent/40 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide text-accent hover:bg-accent/10"
              >
                Open project →
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
