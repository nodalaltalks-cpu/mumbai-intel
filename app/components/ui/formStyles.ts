import type { CSSProperties } from "react";

/**
 * Shared native-<select> styling — `appearance-none` (static Tailwind class)
 * plus a background-image chevron applied via inline `style`, deliberately
 * NOT a Tailwind arbitrary-value class. Tailwind's scanner reads raw source
 * text rather than evaluating JS, so a dynamically-built class name (a
 * template literal interpolating a variable into a bg-image utility) gets
 * picked up as a literal, unresolvable string and breaks the CSS build.
 * Still a real, fully-accessible <select> element underneath.
 */
const CHEVRON_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E";

export const selectClass =
  "appearance-none rounded-sm border border-border bg-surface py-2 pl-2.5 pr-7 text-xs text-foreground transition-colors focus:border-accent focus:outline-none";

export const selectStyle: CSSProperties = {
  backgroundImage: `url("${CHEVRON_SVG}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.5rem center",
  backgroundSize: "14px",
};

/** The site-wide toggle-chip/tag shape: rounded-full pill, matching ActiveFilters and SearchBar's category/status pills. */
export const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide transition-colors ${
    active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
  }`;
