"use client";

import { useActionState } from "react";
import { runHousieyLocalityFormAction, type RunHousieyLocalityFormState } from "@/lib/actions/discovery";
import { Field, FormError } from "@/app/admin/components/FormField";
import SubmitButton from "@/app/admin/components/SubmitButton";

const initialState: RunHousieyLocalityFormState = {};

/**
 * Phase 67 Part 14 — the smallest useful Housiey trigger: one locality slug
 * per run (housiey.com/in/mumbai/<slug>), matching Part 15's "locality-first,
 * not a blind whole-site crawl" instruction. Results land as ordinary
 * ProjectDiscoveryCandidate rows in the SAME candidate list below on this
 * page — Housiey candidates get no special UI, no separate review surface,
 * just a VERIFIED_THIRD_PARTY source tag a founder can see per-candidate.
 */
export default function HousieyLocalityRunForm() {
  const [state, formAction] = useActionState(runHousieyLocalityFormAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <FormError message={state.error} />

      <Field
        label="Housiey locality slug (secondary discovery)"
        name="localitySlug"
        placeholder="worli"
        hint="One Housiey locality page at a time — e.g. worli, lower-parel, byculla. Candidates are tagged Verified Third Party, never treated as official, and go through the same founder review as every other source."
      />

      <SubmitButton pendingText="Scanning Housiey locality page…">Run Housiey discovery</SubmitButton>

      {state.result ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-xs text-muted">
          <p className="text-foreground">
            {state.result.localityPageFetched
              ? `Fetched housiey.com/in/mumbai/${state.result.localitySlug} — ${state.result.projectLinksFound} project link(s) found, ${state.result.pagesFetched} fetched (${state.result.pagesFailed} failed).`
              : `Could not fetch housiey.com/in/mumbai/${state.result.localitySlug} — no candidates produced.`}
          </p>
          <p className="mt-1 text-positive">
            Staged as new discovery candidates: {state.result.totals.staged} · Needs review: {state.result.totals.needsReview} · Duplicates: {state.result.totals.rejectedDuplicate}
          </p>
          <p className="mt-1">
            Excluded — status: {state.result.totals.excludedStatus}, no name: {state.result.totals.excludedNoName}, no location: {state.result.totals.excludedNoLocationText}, unresolved location: {state.result.totals.excludedLocationUnresolved}, outside Mumbai (MMR): {state.result.totals.excludedMmrLocation}, ambiguous location: {state.result.totals.ambiguousLocation}
          </p>
        </div>
      ) : null}
    </form>
  );
}
