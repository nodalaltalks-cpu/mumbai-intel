const LAKH = 100_000;
const CRORE = 10_000_000;

/** Slider hard cap — ₹100 Cr. Typed values above this stay valid (the price param itself is unbounded); only the slider's own range is capped, per spec. */
export const PRICE_SLIDER_MAX_RUPEES = 100 * CRORE;
export const PRICE_SLIDER_STEPS = 1000;

/**
 * Parses Indian real-estate price shorthand into a rupee value:
 * "50L" / "50 Lakh" / "1 Cr" / "1.5cr" / "2.25 Crore", or a bare number
 * (already rupees — what the slider itself produces). Returns null when the
 * input doesn't parse, so callers can leave the previous value untouched
 * instead of silently zeroing it out on a stray keystroke.
 */
export function parseIndianPrice(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/₹/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(l|lac|lacs|lakh|lakhs|cr|crore|crores)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = match[2];
  if (unit?.startsWith("l")) return Math.round(value * LAKH);
  if (unit?.startsWith("c")) return Math.round(value * CRORE);
  return Math.round(value);
}

/**
 * True when a typed value had no lakh/crore/cr unit AND parsed to an amount
 * no real property budget would ever be (under ₹1 lakh) — e.g. "1.2" or "50"
 * typed with no unit, which parseIndianPrice reads literally as ₹1/₹50
 * rather than guessing the unit the person meant. Opt-in (only
 * BudgetPreferenceForm uses this via PriceRangeFilter's warnOnAmbiguous
 * prop) so the public Transactions/Projects price filters, which already
 * rely on parseIndianPrice's plain-rupees fallback, are unaffected.
 */
export function isAmbiguousBareNumber(input: string): boolean {
  const cleaned = input.trim().toLowerCase().replace(/₹/g, "").replace(/,/g, "");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(l|lac|lacs|lakh|lakhs|cr|crore|crores)?$/);
  if (!match) return false;
  const hasUnit = Boolean(match[2]);
  const value = Number(match[1]);
  return !hasUnit && Number.isFinite(value) && value * 1 < LAKH;
}

function trimZeros(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** "₹50 Lakh" / "₹1.5 Cr" / "₹45,000" — the display format for both the From/To inputs and the slider's live range readout. */
export function formatIndianPriceCompact(rupees: number): string {
  if (rupees <= 0) return "₹0";
  if (rupees >= CRORE) return `₹${trimZeros(rupees / CRORE)} Cr`;
  if (rupees >= LAKH) return `₹${trimZeros(rupees / LAKH)} Lakh`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

/**
 * Cubic easing maps a linear 0-1000 slider position to a rupee value so most
 * of the handle's travel covers the ₹10L-₹10Cr band that actual project
 * prices fall in, instead of that band being squeezed into the first few
 * percent of a slider that goes all the way to ₹100 Cr.
 */
export function sliderPositionToRupees(position: number): number {
  const ratio = Math.min(Math.max(position, 0), PRICE_SLIDER_STEPS) / PRICE_SLIDER_STEPS;
  return Math.round(PRICE_SLIDER_MAX_RUPEES * ratio ** 3);
}

/** Inverse of sliderPositionToRupees, for placing a handle from a typed value. Values above the ₹100 Cr slider cap clamp to the far end — the typed value itself is left untouched by the caller. */
export function rupeesToSliderPosition(rupees: number): number {
  const ratio = Math.min(Math.max(rupees, 0), PRICE_SLIDER_MAX_RUPEES) / PRICE_SLIDER_MAX_RUPEES;
  return Math.round(PRICE_SLIDER_STEPS * ratio ** (1 / 3));
}
