"use client";

import { useEffect, useState } from "react";
import {
  formatIndianPriceCompact,
  isAmbiguousBareNumber,
  parseIndianPrice,
  PRICE_SLIDER_STEPS,
  rupeesToSliderPosition,
  sliderPositionToRupees,
} from "@/lib/price-range";

/**
 * From/To text inputs (accepting "50L" / "1.5 Cr" shorthand) synced with a
 * dual-handle 0-100 Cr slider — both edit the same rupee value, whichever
 * the visitor prefers. `minRupees`/`maxRupees` are the same rupee unit
 * ProjectFilters already sends as the priceMin/priceMax URL params, so this
 * component owns no numeric conversion the rest of the filter pipeline
 * doesn't already use.
 */
export default function PriceRangeFilter({
  minRupees,
  maxRupees,
  onCommit,
  warnOnAmbiguous = false,
}: {
  minRupees: number | null;
  maxRupees: number | null;
  onCommit: (min: number | null, max: number | null) => void;
  /** Opt-in: reject (rather than silently commit) a unit-less typed value under ₹1 Lakh, e.g. "1.2" or "50" — nobody means a ₹1 or ₹50 property budget, they forgot Lakh/Cr. Off by default so the public Transactions/Projects price filters (which already treat a bare number as plain rupees, e.g. a precise "4500000") keep their current behavior untouched. */
  warnOnAmbiguous?: boolean;
}) {
  const [ambiguousField, setAmbiguousField] = useState<"min" | "max" | null>(null);
  // Local mirrors of minRupees/maxRupees, not just derived display state --
  // ProjectFilters' onCommit goes through router.push, which re-renders this
  // component with fresh props only after the navigation lands. Reading the
  // *other* field's value off props (rather than these locals) when
  // committing one field would race: typing From then quickly typing To,
  // before the From navigation has round-tripped, would read a still-stale
  // `minRupees` prop and silently overwrite the just-typed min back to null.
  const [minValue, setMinValue] = useState(minRupees);
  const [maxValue, setMaxValue] = useState(maxRupees);
  const [minText, setMinText] = useState(minRupees ? formatIndianPriceCompact(minRupees) : "");
  const [maxText, setMaxText] = useState(maxRupees ? formatIndianPriceCompact(maxRupees) : "");
  const [minPos, setMinPos] = useState(minRupees ? rupeesToSliderPosition(minRupees) : 0);
  const [maxPos, setMaxPos] = useState(maxRupees ? rupeesToSliderPosition(maxRupees) : PRICE_SLIDER_STEPS);

  // Re-syncs when the filter is cleared externally (e.g. the "Price: ..." active-filter chip's × button).
  useEffect(() => {
    setMinValue(minRupees);
    setMinText(minRupees ? formatIndianPriceCompact(minRupees) : "");
    setMinPos(minRupees ? rupeesToSliderPosition(minRupees) : 0);
  }, [minRupees]);
  useEffect(() => {
    setMaxValue(maxRupees);
    setMaxText(maxRupees ? formatIndianPriceCompact(maxRupees) : "");
    setMaxPos(maxRupees ? rupeesToSliderPosition(maxRupees) : PRICE_SLIDER_STEPS);
  }, [maxRupees]);

  function commitText(which: "min" | "max", text: string) {
    if (text.trim() === "") {
      setAmbiguousField(null);
      if (which === "min") {
        setMinValue(null);
        setMinPos(0);
        onCommit(null, maxValue);
      } else {
        setMaxValue(null);
        setMaxPos(PRICE_SLIDER_STEPS);
        onCommit(minValue, null);
      }
      return;
    }
    if (warnOnAmbiguous && isAmbiguousBareNumber(text)) {
      setAmbiguousField(which); // leave the previous committed value untouched -- never silently guess the unit
      return;
    }
    const parsed = parseIndianPrice(text);
    if (parsed === null) return; // unparseable -- leave the typed text alone rather than silently discarding it
    setAmbiguousField(null);
    if (which === "min") {
      setMinValue(parsed);
      setMinText(formatIndianPriceCompact(parsed));
      setMinPos(rupeesToSliderPosition(parsed));
      onCommit(parsed, maxValue);
    } else {
      setMaxValue(parsed);
      setMaxText(formatIndianPriceCompact(parsed));
      setMaxPos(rupeesToSliderPosition(parsed));
      onCommit(minValue, parsed);
    }
  }

  function handleSlider(which: "min" | "max", pos: number) {
    if (which === "min") {
      const clamped = Math.min(pos, maxPos);
      setMinPos(clamped);
      const rupees = sliderPositionToRupees(clamped);
      setMinValue(rupees);
      setMinText(formatIndianPriceCompact(rupees));
      onCommit(rupees, maxValue);
    } else {
      const clamped = Math.max(pos, minPos);
      setMaxPos(clamped);
      const rupees = sliderPositionToRupees(clamped);
      setMaxValue(rupees);
      setMaxText(formatIndianPriceCompact(rupees));
      onCommit(minValue, rupees);
    }
  }

  const leftPct = (minPos / PRICE_SLIDER_STEPS) * 100;
  const rightPct = (maxPos / PRICE_SLIDER_STEPS) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">From</span>
          <input
            value={minText}
            onChange={(e) => {
              setMinText(e.target.value);
              if (ambiguousField === "min") setAmbiguousField(null);
            }}
            onBlur={(e) => commitText("min", e.target.value)}
            placeholder="e.g. 50 Lakh"
            inputMode="decimal"
            aria-invalid={ambiguousField === "min"}
            className={`w-full rounded-sm border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none ${
              ambiguousField === "min" ? "border-negative focus:border-negative" : "border-border focus:border-accent"
            }`}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted">To</span>
          <input
            value={maxText}
            onChange={(e) => {
              setMaxText(e.target.value);
              if (ambiguousField === "max") setAmbiguousField(null);
            }}
            onBlur={(e) => commitText("max", e.target.value)}
            placeholder="e.g. 5 Cr"
            inputMode="decimal"
            aria-invalid={ambiguousField === "max"}
            className={`w-full rounded-sm border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none ${
              ambiguousField === "max" ? "border-negative focus:border-negative" : "border-border focus:border-accent"
            }`}
          />
        </label>
      </div>
      {ambiguousField ? (
        <p className="text-[11px] text-negative">
          Did you mean Lakh or Cr? Please add a unit, e.g. &ldquo;{ambiguousField === "min" ? minText : maxText} Lakh&rdquo; or &ldquo;
          {ambiguousField === "min" ? minText : maxText} Cr&rdquo;.
        </p>
      ) : null}

      <div className="px-1 pb-1 pt-2">
        <div className="relative h-6">
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
          <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
          <input
            type="range"
            className="mi-range"
            min={0}
            max={PRICE_SLIDER_STEPS}
            value={minPos}
            onChange={(e) => handleSlider("min", Number(e.target.value))}
            aria-label="Minimum price"
          />
          <input
            type="range"
            className="mi-range"
            min={0}
            max={PRICE_SLIDER_STEPS}
            value={maxPos}
            onChange={(e) => handleSlider("max", Number(e.target.value))}
            aria-label="Maximum price"
          />
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          {formatIndianPriceCompact(sliderPositionToRupees(minPos))} —{" "}
          {maxPos >= PRICE_SLIDER_STEPS ? "₹100 Cr+" : formatIndianPriceCompact(sliderPositionToRupees(maxPos))}
        </p>
      </div>
    </div>
  );
}
