"use client";

import { useRef, useState } from "react";
import { updatePreferencesAction } from "@/lib/actions/user-preferences";
import PriceRangeFilter from "@/app/components/PriceRangeFilter";

/** Budget preference — reuses the same From/To-typed-or-dragged Indian-currency PriceRangeFilter already built for the public Transactions/Projects filters, so typing "20 lakhs" / "0.2 Cr" / "20,00,000" all normalize the same way here too. Debounced so a slider drag doesn't fire a save per pixel. */
export default function BudgetPreferenceForm({ minRupees, maxRupees }: { minRupees: number | null; maxRupees: number | null }) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCommit(min: number | null, max: number | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      if (min !== null) fd.set("preferredBudgetMinRupees", String(min));
      if (max !== null) fd.set("preferredBudgetMaxRupees", String(max));
      // Ensure a cleared field is submitted even though it has no value, so
      // the field-presence gate in updatePreferencesAction still clears it.
      if (min === null) fd.set("preferredBudgetMinRupees", "");
      if (max === null) fd.set("preferredBudgetMaxRupees", "");
      void updatePreferencesAction({}, fd).then(() => setSavedAt(Date.now()));
    }, 400);
  }

  return (
    <div className="flex flex-col gap-2">
      <PriceRangeFilter minRupees={minRupees} maxRupees={maxRupees} onCommit={handleCommit} />
      <p className="text-[10px] text-muted">{savedAt ? "Saved" : "Type or drag — saved automatically."}</p>
    </div>
  );
}
