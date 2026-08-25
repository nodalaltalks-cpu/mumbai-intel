"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { useProfileCompletion } from "@/lib/profile-completion-client";
import SkipFieldButton from "./SkipFieldButton";

const STATUS_OPTIONS = [
  { value: "PRE_LAUNCH", label: "Pre-launch", hint: "Announced or marketed, but formal construction hasn't started yet." },
  { value: "NEW_LAUNCH", label: "New Launch", hint: "Recently launched, construction underway or just starting." },
  { value: "UNDER_CONSTRUCTION", label: "Under Construction", hint: "Construction is actively in progress." },
  { value: "NEAR_POSSESSION_6M", label: "Near Possession", hint: "Expected possession within 6 months." },
  { value: "READY_TO_MOVE", label: "Ready to Move", hint: "Construction complete, ready for possession now." },
] as const;

/** Property construction status the user is open to — distinct from "purpose" (why they're buying) and kept as its own section since it maps to a real, existing field (preferredReadiness) that previously lived inside the same card as Property Type/Configuration. */
export default function PropertyStatusForm({ preferredReadiness }: { preferredReadiness: string[] }) {
  const [readiness, setReadiness] = useState(new Set(preferredReadiness));
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  function toggle(value: string) {
    const wasComplete = isFieldComplete("readiness");
    const next = new Set(readiness);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setReadiness(next);
    setFieldComplete("readiness", next.size > 0);
    const fd = new FormData();
    fd.set("readinessSubmitted", "1");
    for (const r of next) fd.append("preferredReadiness", r);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next.size > 0) scrollToNextAfter("readiness");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => toggle(s.value)}
            className={`rounded-sm border px-3 py-2 text-left transition-colors ${
              readiness.has(s.value) ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
            }`}
          >
            <span className={`block text-xs font-medium ${readiness.has(s.value) ? "text-accent" : "text-foreground"}`}>{s.label}</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-muted">{s.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">{isPending ? "Saving…" : savedAt ? "Saved" : "Select any that apply, saved automatically."}</p>
        <SkipFieldButton fieldKey="readiness" />
      </div>
    </div>
  );
}
