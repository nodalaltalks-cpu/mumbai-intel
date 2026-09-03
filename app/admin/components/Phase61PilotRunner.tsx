"use client";

import { useRef, useState, useTransition } from "react";
import { runAutoAcceptPilotDryRun, runAutoAcceptPilotRealWrite, type PilotFieldRow, type PilotWriteRow, type DuplicateUrlWarning } from "@/lib/actions/autoAcceptPilot";
import type { PilotProject } from "@/lib/enrichment/pilotProjects";

/**
 * Phase 61 debug-only runner. Deliberately plain (no table styling effort,
 * no charts) -- this is a validation tool for one controlled pilot run, not
 * a piece of the product UI. Renders the raw per-field decision/write rows
 * so every AUTO_ACCEPT/HUMAN_REVIEW/REJECT/MISSING call and every write
 * outcome is directly inspectable.
 *
 * Phase 61A -- accepts an explicit `projects` list so the SAME component
 * (not a copy) can validate the Phase 61A candidates too; defaults to
 * undefined, which makes the underlying server actions fall back to their
 * own default (the locked Phase 59B ten), preserving Phase 61's exact
 * original behavior wherever this component is used with no prop.
 */
export default function Phase61PilotRunner({ projects }: { projects?: PilotProject[] }) {
  const [dryRunRows, setDryRunRows] = useState<PilotFieldRow[] | null>(null);
  const [dryRunDuplicates, setDryRunDuplicates] = useState<DuplicateUrlWarning[]>([]);
  const [writeRows, setWriteRows] = useState<PilotWriteRow[] | null>(null);
  const [writeDuplicates, setWriteDuplicates] = useState<DuplicateUrlWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWrite, setConfirmingWrite] = useState(false);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runDryRun() {
    setError(null);
    startTransition(async () => {
      try {
        const result = projects ? await runAutoAcceptPilotDryRun(projects) : await runAutoAcceptPilotDryRun();
        setDryRunRows(result.rows);
        setDryRunDuplicates(result.duplicateUrlWarnings);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function handleRealWriteClick() {
    if (!confirmingWrite) {
      setConfirmingWrite(true);
      timeoutRef.current = setTimeout(() => setConfirmingWrite(false), 5000);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setConfirmingWrite(false);
    setError(null);
    startTransition(async () => {
      try {
        const result = projects ? await runAutoAcceptPilotRealWrite(projects) : await runAutoAcceptPilotRealWrite();
        setWriteRows(result.rows);
        setWriteDuplicates(result.duplicateUrlWarnings);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function summarize(rows: { decision?: string; writeOutcome?: string }[], key: "decision" | "writeOutcome") {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const v = (r[key] as string) ?? "?";
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={runDryRun}
          disabled={isPending}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {isPending ? "Running..." : "1. Run Dry Run"}
        </button>
        <button
          type="button"
          onClick={handleRealWriteClick}
          disabled={isPending || !dryRunRows}
          className={`rounded-sm border px-3 py-1.5 text-xs font-mono uppercase tracking-wide disabled:opacity-40 ${
            confirmingWrite ? "border-negative bg-negative/10 text-negative" : "border-border text-foreground hover:border-negative hover:text-negative"
          }`}
        >
          {isPending ? "Running..." : confirmingWrite ? "Confirm REAL WRITE?" : "2. Run Real Write"}
        </button>
      </div>
      {error ? <p className="text-xs text-negative">{error}</p> : null}

      {dryRunRows ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-mono uppercase tracking-wide text-muted">Dry run — {dryRunRows.length} fields evaluated</h2>
          <pre className="max-h-40 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">{JSON.stringify(summarize(dryRunRows, "decision"), null, 1)}</pre>
          {dryRunDuplicates.length > 0 ? (
            <p className="text-xs text-negative">{dryRunDuplicates.length} duplicate sourceUrl warning(s) — see raw output below.</p>
          ) : null}
          <h3 className="text-[10px] font-mono uppercase tracking-wide text-muted">Non-MISSING rows only (compact)</h3>
          <pre className="max-h-96 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">
            {JSON.stringify(
              dryRunRows.filter((r) => r.classification !== "MISSING"),
              null,
              1
            )}
          </pre>
          <pre className="max-h-96 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">{JSON.stringify({ dryRunRows, dryRunDuplicates }, null, 1)}</pre>
        </section>
      ) : null}

      {writeRows ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-mono uppercase tracking-wide text-muted">Real write — {writeRows.length} fields processed</h2>
          <pre className="max-h-40 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">{JSON.stringify(summarize(writeRows, "writeOutcome"), null, 1)}</pre>
          <h3 className="text-[10px] font-mono uppercase tracking-wide text-muted">Non-MISSING rows only (compact)</h3>
          <pre className="max-h-96 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">
            {JSON.stringify(
              writeRows.filter((r) => r.classification !== "MISSING"),
              null,
              1
            )}
          </pre>
          <pre className="max-h-96 overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">{JSON.stringify({ writeRows, writeDuplicates }, null, 1)}</pre>
        </section>
      ) : null}
    </div>
  );
}
