"use client";

import { useActionState } from "react";
import { runMumbaiDiscoveryFormAction, type RunMumbaiDiscoveryFormState } from "@/lib/actions/discovery";
import { TextareaField, FormError } from "@/app/admin/components/FormField";
import SubmitButton from "@/app/admin/components/SubmitButton";

const initialState: RunMumbaiDiscoveryFormState = {};

/**
 * Phase 55 Part J — the smallest practical trigger: a founder pastes
 * developer names (one per line or comma-separated, must already be
 * curated in developerDomainRegistry.ts) and runs discovery. Results land
 * in the candidate list below on this same page — this form is
 * deliberately just an input + a summary, not a dashboard.
 */
export default function MumbaiDiscoveryRunForm() {
  const [state, formAction] = useActionState(runMumbaiDiscoveryFormAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <FormError message={state.error} />

      <TextareaField
        label="Developer names (one per line, or comma-separated)"
        name="developerNames"
        placeholder={"Lodha\nGodrej Properties\nPiramal Realty"}
        hint="Must already be verified in the curated developer registry — an unrecognized name is skipped, never scanned with a guessed domain."
      />

      <SubmitButton pendingText="Scanning developer sites…">Run Mumbai discovery</SubmitButton>

      {state.result ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted">
          <p className="text-foreground">
            Scanned {state.result.developersScanned} / {state.result.developersRequested} developer
            {state.result.developersRequested === 1 ? "" : "s"} in {Math.round(state.result.durationMs / 1000)}s.
          </p>
          {state.result.developersSkippedUnknownDomain.length > 0 ? (
            <p className="mt-1">Skipped (not curated): {state.result.developersSkippedUnknownDomain.join(", ")}</p>
          ) : null}
          <p className="mt-1">
            Project URLs found: {state.result.candidateUrlsDiscoveredTotal} · Pages fetched: {state.result.pagesFetchedTotal}
          </p>
          <p className="mt-1 text-positive">
            Staged as new discovery candidates: {state.result.totals.staged} · Needs review: {state.result.totals.needsReview} · Duplicates: {state.result.totals.rejectedDuplicate}
          </p>
          <p className="mt-1">
            Excluded — status: {state.result.totals.excludedStatus}, no name: {state.result.totals.excludedNoName}, no location: {state.result.totals.excludedNoLocationText}, unresolved location: {state.result.totals.excludedLocationUnresolved}, ambiguous location: {state.result.totals.ambiguousLocation}
          </p>
        </div>
      ) : null}
    </form>
  );
}
