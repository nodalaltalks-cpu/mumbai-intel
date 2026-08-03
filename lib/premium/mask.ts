/**
 * Placeholder-producing helpers for guest-facing "premium" values — mirror
 * lib/format.ts's naming but never take a real value as input, so it's
 * structurally impossible for a real number to slip into a masked call site.
 * The visual "████" look comes from these fixed strings, not CSS blur on
 * real digits — real values must never reach guest-rendered HTML.
 */
export function maskPaise(): string {
  return "████████";
}

export function maskPricePerSqft(): string {
  return "██████";
}

export function maskPercent(): string {
  return "███";
}

export function maskCount(): string {
  return "███";
}

export function maskScore(): string {
  return "██/10";
}

/** The one place a page decides whether the real value is even constructed. */
export function gated<T>(locked: boolean, real: T, placeholder: T): T {
  return locked ? placeholder : real;
}

/**
 * ProjectCard (and BrochureDownloadLink inside it) are Client Components —
 * any prop passed to them is serialized into the page's hydration payload
 * and present in guest-viewable HTML, no matter which internal branch
 * renders. A `locked` boolean alone can't prevent a real brochureUrl (or
 * pricePerSqftPaise — the same "premium intelligence" field masked on the
 * project detail page and LocalityCard) from leaking; the real value must
 * never cross the server→client boundary at all when locked.
 * `brochureAvailable`/`pricePerSqftMasked` are plain booleans (safe to
 * expose) that preserve the card's affordances for guests — only the
 * actionable download URL and the real price/sqft number are nulled out.
 * `brochureThumbnailUrl` is deliberately left as-is: it's a cover image,
 * not the gated asset itself, and showing it is part of the "premium"
 * unlock hook rather than something that needs withholding.
 */
export function maskProjectBrochure<
  T extends {
    brochureUrl?: string | null;
    brochureFileName?: string | null;
    brochureThumbnailUrl?: string | null;
    pricePerSqftPaise?: number | null;
  },
>(project: T, locked: boolean): T & { brochureAvailable: boolean; pricePerSqftMasked: boolean } {
  const brochureAvailable = Boolean(project.brochureUrl);
  if (!locked) return { ...project, brochureAvailable, pricePerSqftMasked: false };
  const pricePerSqftMasked = project.pricePerSqftPaise != null;
  return {
    ...project,
    brochureUrl: null,
    brochureFileName: null,
    brochureAvailable,
    pricePerSqftPaise: null,
    pricePerSqftMasked,
  };
}
