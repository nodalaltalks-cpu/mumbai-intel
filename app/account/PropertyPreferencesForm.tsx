"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { CATEGORY_LABEL, CONFIGURATION_FILTER_OPTIONS, PROPERTY_CATEGORIES } from "@/lib/project-meta";
import { useProfileCompletion } from "@/lib/profile-completion-client";

// Non-BHK property shapes, kept local to this preference form rather than
// added to lib/project-meta.ts's CONFIGURATION_FILTER_OPTIONS — that list is
// shared with the public Projects/Transactions filters, and these are a
// user's loose research preference, not a real listing filter value.
const SPECIAL_CONFIGURATION_OPTIONS = [
  { value: "PENTHOUSE", label: "Penthouse" },
  { value: "DUPLEX", label: "Duplex" },
  { value: "BUNGALOW", label: "Bungalow" },
  { value: "PLOT", label: "Plot" },
  { value: "LAND", label: "Land" },
] as const;

/** Property type / configuration — instant-save (no separate Save button), each change posting only this card's own fields; lib/actions/user-preferences.ts's field-presence gating means the other cards' saved values are never touched. Both are multi-select (a user researching can be open to more than one at once). */
export default function PropertyPreferencesForm({
  preferredCategories,
  preferredConfigurations,
}: {
  preferredCategories: string[];
  preferredConfigurations: string[];
}) {
  const [categories, setCategories] = useState(new Set<string>(preferredCategories));
  const [configurations, setConfigurations] = useState(new Set(preferredConfigurations));
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  function save(next: { categories?: Set<string>; configurations?: Set<string> }, wasComplete: { category: boolean; configuration: boolean }) {
    const fd = new FormData();
    fd.set("categoriesSubmitted", "1");
    for (const c of next.categories ?? categories) fd.append("preferredCategories", c);
    fd.set("configurationsSubmitted", "1");
    for (const c of next.configurations ?? configurations) fd.append("preferredConfigurations", c);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete.category && (next.categories ?? categories).size > 0) scrollToNextAfter("category");
      if (!wasComplete.configuration && (next.configurations ?? configurations).size > 0) scrollToNextAfter("configuration");
    });
  }

  function toggleCategory(value: string) {
    const wasComplete = { category: isFieldComplete("category"), configuration: isFieldComplete("configuration") };
    const next = new Set(categories);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCategories(next);
    setFieldComplete("category", next.size > 0);
    save({ categories: next }, wasComplete);
  }

  function toggleConfiguration(value: string) {
    const wasComplete = { category: isFieldComplete("category"), configuration: isFieldComplete("configuration") };
    const next = new Set(configurations);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setConfigurations(next);
    setFieldComplete("configuration", next.size > 0);
    save({ configurations: next }, wasComplete);
  }

  return (
    <div className="flex flex-col gap-4">
      <div id="field-category" tabIndex={-1}>
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

      <div id="field-configuration" tabIndex={-1}>
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
          {SPECIAL_CONFIGURATION_OPTIONS.map((c) => (
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

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">{isPending ? "Saving…" : savedAt ? "Saved" : "Tap to select, saved automatically."}</p>
      </div>
    </div>
  );
}
