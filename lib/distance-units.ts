export type DistanceUnit = "km" | "m";

/** Splits a stored whole-meters distance back into the natural unit an admin would type it in — "1.2" + km for anything a kilometre or more, "450" + m otherwise. */
export function metersToAmountUnit(meters: number | null | undefined): { amount: string; unit: DistanceUnit } {
  if (!meters) return { amount: "", unit: "m" };
  if (meters >= 1000) return { amount: String(Math.round((meters / 1000) * 100) / 100), unit: "km" };
  return { amount: String(meters), unit: "m" };
}

/** Amount + unit → the whole-meters integer distanceMeters still expects — no schema or backend change needed, km/m is purely a form-input affordance. */
export function amountUnitToMeters(amount: string, unit: DistanceUnit): string {
  const n = Number(amount);
  if (!amount.trim() || Number.isNaN(n)) return "";
  const meters = unit === "km" ? n * 1000 : n;
  return String(Math.round(meters));
}
