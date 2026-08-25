"use client";

import { useActionState } from "react";
import { updateCapacityBaselineAction, type CapacityBaselineActionState } from "@/lib/actions/platform-health";

const INITIAL_STATE: CapacityBaselineActionState = {};

export default function CapacityBaselineForm({
  defaultConcurrency,
  defaultTestedAt,
  defaultConfidence,
  defaultNotes,
}: {
  defaultConcurrency: number | null;
  defaultTestedAt: string;
  defaultConfidence: string;
  defaultNotes: string;
}) {
  const [state, formAction, isPending] = useActionState(updateCapacityBaselineAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-xs">
      <p className="text-[10px] uppercase tracking-wide text-muted">Record a load test result (Founder only)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Highest tested concurrency</span>
          <input name="highestTestedConcurrency" type="number" min={1} defaultValue={defaultConcurrency ?? ""} required className="rounded-sm border border-border bg-background px-2 py-1 text-foreground" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Tested on</span>
          <input name="testedAt" type="date" defaultValue={defaultTestedAt} required className="rounded-sm border border-border bg-background px-2 py-1 text-foreground" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Confidence</span>
          <select name="confidence" defaultValue={defaultConfidence} className="rounded-sm border border-border bg-background px-2 py-1 text-foreground">
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">Notes</span>
          <input name="notes" type="text" defaultValue={defaultNotes} maxLength={500} className="rounded-sm border border-border bg-background px-2 py-1 text-foreground" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={isPending} className="w-fit rounded-sm border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50">
          {isPending ? "Saving…" : "Save baseline"}
        </button>
        {state.success ? <span className="text-positive">Saved.</span> : null}
        {state.error ? <span className="text-negative">{state.error}</span> : null}
      </div>
    </form>
  );
}
