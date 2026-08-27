"use client";

import { useState, useTransition } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const FAMILY_SIZE_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6_PLUS", label: "6+" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

const FAMILY_INCOME_OPTIONS = [
  { value: "BELOW_5L", label: "Below ₹5 Lakh" },
  { value: "5L_10L", label: "₹5–10 Lakh" },
  { value: "10L_20L", label: "₹10–20 Lakh" },
  { value: "20L_50L", label: "₹20–50 Lakh" },
  { value: "50L_1CR", label: "₹50 Lakh–₹1 Crore" },
  { value: "1CR_PLUS", label: "₹1 Crore+" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

/** Single-select each (a household has one size, one income bracket — unlike category/configuration where a user can be open to several). Private: never shown on any public page, never included in analytics metadata (see updatePreferencesAction — only the field key "familySize"/"familyIncome" is ever recorded, never the value). */
export default function FamilyForm({ familySize, familyIncomeRange }: { familySize: string | null; familyIncomeRange: string | null }) {
  const [size, setSize] = useState(familySize ?? "");
  const [income, setIncome] = useState(familyIncomeRange ?? "");
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  function pickSize(value: string) {
    const wasComplete = isFieldComplete("familySize");
    const next = size === value ? "" : value;
    setSize(next);
    setFieldComplete("familySize", Boolean(next));
    const fd = new FormData();
    fd.set("familySize", next);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next) scrollToNextAfter("familySize");
    });
  }

  function pickIncome(value: string) {
    const wasComplete = isFieldComplete("familyIncome");
    const next = income === value ? "" : value;
    setIncome(next);
    setFieldComplete("familyIncome", Boolean(next));
    const fd = new FormData();
    fd.set("familyIncomeRange", next);
    startTransition(async () => {
      await updatePreferencesAction({}, fd);
      setSavedAt(Date.now());
      if (!wasComplete && next) scrollToNextAfter("familyIncome");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div id="field-familySize" tabIndex={-1}>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Family size</span>
        <div className="flex flex-wrap gap-1.5">
          {FAMILY_SIZE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pickSize(o.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                size === o.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div id="field-familyIncome" tabIndex={-1}>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-muted">Family income</span>
        <div className="flex flex-wrap gap-1.5">
          {FAMILY_INCOME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pickIncome(o.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                income === o.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted">
        {isPending ? "Saving…" : savedAt ? "Saved" : "Private — never shown publicly, saved automatically."}
      </p>
    </div>
  );
}
