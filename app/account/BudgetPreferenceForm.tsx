"use client";

import { useRef, useState } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";
import { formatIndianPriceCompact } from "@/lib/price-range";
import { useProfileCompletion } from "@/lib/profile-completion-client";

/** Budget preference — reuses the same From/To-typed-or-dragged Indian-currency PriceRangeFilter already built for the public Transactions/Projects filters, so typing "20 lakhs" / "0.2 Cr" / "20,00,000" all normalize the same way here too. Debounced so a slider drag doesn't fire a save per pixel. */
export default function BudgetPreferenceForm({ minRupees, maxRupees }: { minRupees: number | null; maxRupees: number | null }) {
  const [saved, setSaved] = useState<{ min: number | null; max: number | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setFieldComplete, isFieldComplete, scrollToNextAfter } = useProfileCompletion();

  function handleCommit(min: number | null, max: number | null) {
    // Read BEFORE the optimistic flip below: only a genuine incomplete -> complete
    // transition should auto-advance the user away. Without this, every further
    // edit to an already-set budget (nudging the slider, refining the range)
    // would yank them straight to the next section before they're done (Section 18).
    const wasComplete = isFieldComplete("budget");
    setFieldComplete("budget", min !== null || max !== null); // optimistic — real value still comes from the server action below
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      if (min !== null) fd.set("preferredBudgetMinRupees", String(min));
      if (max !== null) fd.set("preferredBudgetMaxRupees", String(max));
      // Ensure a cleared field is submitted even though it has no value, so
      // the field-presence gate in updatePreferencesAction still clears it.
      if (min === null) fd.set("preferredBudgetMinRupees", "");
      if (max === null) fd.set("preferredBudgetMaxRupees", "");
      void updatePreferencesAction({}, fd).then(() => {
        setSaved({ min, max });
        if (!wasComplete && (min !== null || max !== null)) scrollToNextAfter("budget");
      });
    }, 1200);
  }

  const feedback =
    saved && (saved.min !== null || saved.max !== null)
      ? `We'll prioritize projects ${saved.min !== null ? `from ${formatIndianPriceCompact(saved.min)}` : "up to"} ${
          saved.max !== null ? formatIndianPriceCompact(saved.max) : "and above"
        } for you.`
      : saved
        ? "Saved."
        : "Type or drag, saved automatically.";

  return (
    <div className="flex flex-col gap-2">
      <PriceRangeFilter minRupees={minRupees} maxRupees={maxRupees} onCommit={handleCommit} warnOnAmbiguous />
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">{feedback}</p>
      </div>
    </div>
  );
}
