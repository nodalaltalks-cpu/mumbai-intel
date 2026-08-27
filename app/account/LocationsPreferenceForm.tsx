"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { useProfileCompletion } from "@/lib/profile-completion-client";

/**
 * Locations preference — two distinct inputs, stored separately per Section
 * 16 ("Store structured locality information separately from free-text
 * preference"): checkboxes against the existing Locality catalog
 * (preferredLocalityIds) for suggestions, plus free-text entry for a
 * landmark/area with no catalog record at all ("Near Kurla station"). Both
 * instant-save like the other preference cards.
 */
export default function LocationsPreferenceForm({
  preferredLocalityIds,
  localityFreeText,
  localities,
}: {
  preferredLocalityIds: string[];
  localityFreeText: string[];
  localities: { id: string; name: string }[];
}) {
  const [checkedIds, setCheckedIds] = useState(new Set(preferredLocalityIds));
  const [freeText, setFreeText] = useState(localityFreeText);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  const nameById = new Map(localities.map((l) => [l.id, l.name]));
  function selectedLabels(ids: Set<string>, freeTextList: string[]): string[] {
    return [...Array.from(ids).map((id) => nameById.get(id) ?? id), ...freeTextList];
  }

  function saveIds(next: Set<string>) {
    // Only auto-advance on a genuine incomplete -> complete transition, not on
    // every checkbox toggle once the field is already complete (Section 12/18).
    const wasComplete = isFieldComplete("localities");
    setFieldComplete("localities", next.size > 0 || freeText.length > 0);
    const fd = new FormData();
    fd.set("localityIdsSubmitted", "1");
    for (const id of next) fd.append("preferredLocalityIds", id);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next.size > 0) scrollToNextAfter("localities");
    });
  }

  function saveFreeText(next: string[]) {
    const wasComplete = isFieldComplete("localities");
    setFieldComplete("localities", next.length > 0 || checkedIds.size > 0);
    const fd = new FormData();
    fd.set("localityFreeTextSubmitted", "1");
    for (const t of next) fd.append("localityFreeText", t);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next.length > 0) scrollToNextAfter("localities");
    });
  }

  function toggleId(id: string) {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
    saveIds(next);
  }

  function addFreeText() {
    const value = draft.trim();
    if (!value || freeText.includes(value)) {
      setDraft("");
      return;
    }
    const next = [...freeText, value];
    setFreeText(next);
    setDraft("");
    saveFreeText(next);
  }

  function removeFreeText(value: string) {
    const next = freeText.filter((v) => v !== value);
    setFreeText(next);
    saveFreeText(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Add a location or landmark</span>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFreeText();
              }
            }}
            placeholder="e.g. Near Kurla station, BKC"
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={addFreeText}
            className="shrink-0 rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-mono uppercase tracking-wide text-accent hover:bg-accent/20"
          >
            Add
          </button>
        </div>
        {freeText.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {freeText.map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3 py-1 text-xs text-foreground">
                {t}
                <button type="button" onClick={() => removeFreeText(t)} aria-label={`Remove ${t}`} className="text-muted hover:text-negative">
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {localities.length > 0 ? (
        <div>
          <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Or pick from covered localities</span>
          <div className="grid max-h-40 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto rounded-sm border border-border p-3 sm:grid-cols-3">
            {localities.map((l) => (
              <label key={l.id} className="flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={checkedIds.has(l.id)} onChange={() => toggleId(l.id)} className="h-3.5 w-3.5 accent-accent" />
                {l.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted">
          {isPending
            ? "Saving…"
            : savedAt && (checkedIds.size > 0 || freeText.length > 0)
              ? `Your recommendations will now prioritize ${selectedLabels(checkedIds, freeText).join(", ")}.`
              : "Saved automatically."}
        </p>
      </div>
    </div>
  );
}
