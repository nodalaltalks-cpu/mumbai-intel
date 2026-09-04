"use client";

import { useState, useTransition } from "react";
import { runPhase65EnrichmentPass, type Phase65ProjectResult } from "@/lib/actions/phase65Enrichment";

/** Phase 65 debug-only runner — same minimal pattern as Phase61PilotRunner. */
export default function Phase65EnrichmentRunner({ stagingRecordIds }: { stagingRecordIds: string[] }) {
  const [results, setResults] = useState<Phase65ProjectResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runPhase65EnrichmentPass(stagingRecordIds);
        setResults(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="w-fit rounded-sm border border-border px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-foreground hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {isPending ? "Running..." : "Run Enrichment Pass"}
      </button>
      {error ? <p className="text-xs text-negative">{error}</p> : null}
      {results ? (
        <pre className="max-h-[70vh] overflow-auto rounded-sm border border-border bg-surface-raised p-2 text-[10px]">
          {JSON.stringify(results, null, 1)}
        </pre>
      ) : null}
    </div>
  );
}
