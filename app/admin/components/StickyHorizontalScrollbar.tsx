"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Phase 68 — a persistent horizontal scroll control for a wide, tall,
 * independently-scrolling table. Problem this solves: DiscoveryCandidateList's
 * own table wrapper (`max-h-[70vh] overflow-auto`) puts its native horizontal
 * scrollbar at the BOTTOM edge of that box — which, once the page has enough
 * content above it (run-trigger forms, backlog summary, status/source tabs,
 * secondary filters), sits below the fold most of the time. A founder
 * reviewing candidates has to keep scrolling the whole page down to reach it.
 *
 * Deliberately NOT a second table or a layout rework: this renders a single
 * thin, empty, horizontally-scrollable strip as a SIBLING right after the
 * real table's scroll container (never inside it — sticky positioning is
 * relative to the nearest scrolling ancestor, which must be the page itself,
 * not the already-`overflow-auto` table box). It mirrors the table's own
 * `scrollWidth` and stays `sticky bottom` so it remains reachable near the
 * viewport's bottom edge for as long as any part of the table region is
 * still on screen, then scrolls away normally once the founder scrolls past
 * the table entirely — never a permanent overlay on top of real content.
 *
 * Bidirectional sync: scrolling either the real table or this strip updates
 * the other's `scrollLeft`. A one-directional "which side is driving" guard
 * (`syncSourceRef`) avoids feedback ping-pong between the two scroll
 * listeners; the table's own native horizontal scrollbar keeps working
 * exactly as before (Requirement 11 — this is additive, not a replacement).
 */

/** Pure — extracted so the show/hide threshold is unit-testable without a real DOM (jsdom never computes real layout metrics). The +1 tolerance absorbs sub-pixel rounding some browsers introduce between scrollWidth and clientWidth for content that otherwise exactly fits. */
export function shouldShowFloatingScrollbar(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth + 1;
}

export default function StickyHorizontalScrollbar({
  targetRef,
  watch,
}: {
  targetRef: RefObject<HTMLElement | null>;
  /**
   * Optional re-measure signal. A `<table>`'s rendered width is content-driven
   * (no `table-layout: fixed` here), and a ResizeObserver on the table element
   * does not reliably fire for every content-only width change across browsers
   * — confirmed in practice when switching Discovery Queue status filters
   * (same container, new rows, different natural table width). Pass a value
   * that changes whenever the caller's row/content set changes (e.g. a join of
   * visible row ids) to force a fresh measurement alongside the
   * ResizeObserver, which still independently covers real window/container
   * resizes.
   */
  watch?: string | number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  /** Which side is currently driving a sync, so the other side's own scroll listener doesn't immediately bounce the update back and forth. */
  const syncSourceRef = useRef<"table" | "bar" | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    function measure() {
      if (!target) return;
      setScrollWidth(target.scrollWidth);
      setVisible(shouldShowFloatingScrollbar(target.scrollWidth, target.clientWidth));
    }
    measure();

    // Requirement 7 — window/container resizes.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(target);
    const inner = target.firstElementChild;
    if (inner) resizeObserver.observe(inner);

    function onTargetScroll() {
      if (syncSourceRef.current === "bar") return;
      syncSourceRef.current = "table";
      if (barRef.current) barRef.current.scrollLeft = target!.scrollLeft;
      syncSourceRef.current = null;
    }
    target.addEventListener("scroll", onTargetScroll);

    return () => {
      resizeObserver.disconnect();
      target.removeEventListener("scroll", onTargetScroll);
    };
  }, [targetRef]);

  // Requirement 7 — filter/row-set changes: re-measure explicitly rather than relying solely on
  // ResizeObserver, which doesn't reliably fire for a table's content-only width changes.
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    setScrollWidth(target.scrollWidth);
    setVisible(shouldShowFloatingScrollbar(target.scrollWidth, target.clientWidth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  function onBarScroll() {
    if (syncSourceRef.current === "table") return;
    const target = targetRef.current;
    if (!target || !barRef.current) return;
    syncSourceRef.current = "bar";
    target.scrollLeft = barRef.current.scrollLeft;
    syncSourceRef.current = null;
  }

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      onScroll={onBarScroll}
      aria-hidden="true"
      className="sticky bottom-2 z-20 mt-1.5 h-3 overflow-x-auto overflow-y-hidden rounded-sm border border-border bg-surface/95 shadow-sm backdrop-blur-sm"
    >
      <div style={{ width: scrollWidth, height: 1 }} />
    </div>
  );
}
