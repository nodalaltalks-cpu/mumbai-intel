"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const PURPOSE_OPTIONS = [
  { value: "SELF_USE", label: "Self Use" },
  { value: "INVESTMENT", label: "Investment" },
  { value: "RESEARCHING", label: "Just Researching" },
] as const;

/** Purpose is a genuine multi-select (Section 14: "The user must be able to select BOTH") — not a radio group. Instant-save like the other toggle cards. */
export default function PurposeForm({ purposes }: { purposes: string[] }) {
  const [selected, setSelected] = useState(new Set(purposes));
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  function toggle(value: string) {
    const wasComplete = isFieldComplete("purpose");
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSelected(next);
    setFieldComplete("purpose", next.size > 0);
    const fd = new FormData();
    fd.set("purposesSubmitted", "1");
    for (const p of next) fd.append("purposes", p);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next.size > 0) scrollToNextAfter("purpose");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {PURPOSE_OPTIONS.map((p) => (
          <label key={p.value} className="flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm text-foreground hover:border-accent/50">
            <input type="checkbox" checked={selected.has(p.value)} onChange={() => toggle(p.value)} className="h-4 w-4 accent-accent" />
            {p.label}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">{isPending ? "Saving…" : savedAt ? "Saved" : "Select any that apply, saved automatically."}</p>
      </div>
    </div>
  );
}
