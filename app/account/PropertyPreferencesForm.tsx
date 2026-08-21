"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS, PROPERTY_CATEGORIES } from "@/lib/project-meta";

const READINESS_OPTIONS = [
  { value: "READY_TO_MOVE", label: "Ready to Move" },
  { value: "UNDER_CONSTRUCTION", label: "Under Construction" },
  { value: "NEW_LAUNCH", label: "New Launch" },
] as const;

/** Property type / configuration / status — all instant-save (no separate Save button) since these are simple toggles, matching the progressive-profile "save automatically where practical" goal. Each change posts only this card's own fields; lib/actions/user-preferences.ts's field-presence gating means the other cards' saved values are never touched. Property type is multi-select (a user researching can be open to more than one type at once), same shape as configuration/status below. */
export default function PropertyPreferencesForm({
  preferredCategories,
  preferredConfigurations,
  preferredReadiness,
}: {
  preferredCategories: string[];
  preferredConfigurations: string[];
  preferredReadiness: string[];
}) {
  const [categories, setCategories] = useState(new Set<string>(preferredCategories));
  const [configurations, setConfigurations] = useState(new Set(preferredConfigurations));
  const [readiness, setReadiness] = useState(new Set(preferredReadiness));
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save(next: { categories?: Set<string>; configurations?: Set<string>; readiness?: Set<string> }) {
    const fd = new FormData();
    fd.set("categoriesSubmitted", "1");
    for (const c of next.categories ?? categories) fd.append("preferredCategories", c);
    fd.set("configurationsSubmitted", "1");
    for (const c of next.configurations ?? configurations) fd.append("preferredConfigurations", c);
    fd.set("readinessSubmitted", "1");
    for (const r of next.readiness ?? readiness) fd.append("preferredReadiness", r);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
    });
  }

  function toggleCategory(value: string) {
    const next = new Set(categories);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCategories(next);
    save({ categories: next });
  }

  function toggleConfiguration(value: string) {
    const next = new Set(configurations);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setConfigurations(next);
    save({ configurations: next });
  }

  function toggleReadiness(value: string) {
    const next = new Set(readiness);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setReadiness(next);
    save({ readiness: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Property type (select any)</span>
        <div className="flex flex-wrap gap-1.5">
          {PROPERTY_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCategory(c)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                categories.has(c) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Configuration (select any)</span>
        <div className="flex flex-wrap gap-1.5">
          {CONFIGURATION_FILTER_OPTIONS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => toggleConfiguration(c.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                configurations.has(c.value) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Status (select any)</span>
        <div className="flex flex-wrap gap-1.5">
          {READINESS_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleReadiness(r.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                readiness.has(r.value) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted">{isPending ? "Saving…" : savedAt ? "Saved" : "Tap to select, saved automatically."}</p>
    </div>
  );
}
