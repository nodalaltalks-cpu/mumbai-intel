"use client";

import type { PriceUnit } from "@/lib/price-units";

/** Cr/Lakh/exact amount entry that submits as a plain rupee number under `name` — shared by the main Project Pricing tab and the Unit Configurations price fields so both work the same way. */
export default function PriceAmountField({
  label,
  name,
  amount,
  unit,
  onAmountChange,
  onUnitChange,
  rupees,
  important,
}: {
  label: string;
  name: string;
  amount: string;
  unit: PriceUnit;
  onAmountChange: (v: string) => void;
  onUnitChange: (v: PriceUnit) => void;
  rupees: string;
  important?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label} {important ? <span className="text-negative">*</span> : null}
      </span>
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          min={0}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="e.g. 1.5"
          className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as PriceUnit)}
          className="rounded-sm border border-border bg-surface px-2 py-2 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
        >
          <option value="cr">Cr</option>
          <option value="lakh">Lakh</option>
          <option value="exact">₹ exact</option>
        </select>
      </div>
      <span className="text-[10px] text-muted">{rupees ? `= ₹${Number(rupees).toLocaleString("en-IN")}` : "No zeros needed — e.g. 1.5 Cr, or 78 Lakh"}</span>
      <input type="hidden" name={name} value={rupees} />
    </div>
  );
}
