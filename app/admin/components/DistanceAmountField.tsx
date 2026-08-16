"use client";

import type { DistanceUnit } from "@/lib/distance-units";

/** Km/meter amount entry that submits as a whole-meters integer under `name` — same pattern as PriceAmountField's Cr/Lakh entry. */
export default function DistanceAmountField({
  label,
  name,
  amount,
  unit,
  onAmountChange,
  onUnitChange,
  meters,
}: {
  label: string;
  name: string;
  amount: string;
  unit: DistanceUnit;
  onAmountChange: (v: string) => void;
  onUnitChange: (v: DistanceUnit) => void;
  meters: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          min={0}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="e.g. 450"
          className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as DistanceUnit)}
          className="rounded-sm border border-border bg-surface px-2 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="m">m</option>
          <option value="km">km</option>
        </select>
      </div>
      <span className="text-[10px] text-muted">{meters ? `= ${Number(meters).toLocaleString("en-IN")}m` : "e.g. 450 m, or 1.2 km"}</span>
      <input type="hidden" name={name} value={meters} />
    </div>
  );
}
