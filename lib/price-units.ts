export type PriceUnit = "cr" | "lakh" | "exact";

/** Splits a stored rupee amount back into the natural unit an Indian admin would type it in — "1.35" + Cr, not "13500000" + exact — so editing an existing value never shows the raw zero-padded number. */
export function rupeesToAmountUnit(rupees: number | null | undefined): { amount: string; unit: PriceUnit } {
  if (!rupees) return { amount: "", unit: "cr" };
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (rupees >= 1e7) return { amount: String(round2(rupees / 1e7)), unit: "cr" };
  if (rupees >= 1e5) return { amount: String(round2(rupees / 1e5)), unit: "lakh" };
  return { amount: String(rupees), unit: "exact" };
}

/** Amount + unit → the plain rupee number the server action still expects — no schema or backend change needed, the Cr/Lakh convenience is purely a form-input affordance. */
export function amountUnitToRupees(amount: string, unit: PriceUnit): string {
  const n = Number(amount);
  if (!amount.trim() || Number.isNaN(n)) return "";
  const multiplier = unit === "cr" ? 1e7 : unit === "lakh" ? 1e5 : 1;
  return String(Math.round(n * multiplier));
}
