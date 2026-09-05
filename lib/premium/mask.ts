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
 * Phase 68 — brochure download is now a deliberately, permanently free and
 * ungated action (project brief: "no sign-in, no phone number, no OTP, no
 * lead form... if the brochure exists, it should be directly accessible").
 * This function keeps its name and shape (every call site across
 * ProjectCard/Compare/related-projects/etc. still calls it the same way) but
 * no longer nulls out brochureUrl/brochureFileName for a locked guest —
 * `pricePerSqftPaise` masking is a SEPARATE, unrelated premium feature and is
 * deliberately left untouched here; this phase is brochure-only.
 * `brochureAvailable`/`pricePerSqftMasked` remain plain booleans for the
 * card's own affordances. `brochureThumbnailUrl` was already always shown.
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
    brochureAvailable,
    pricePerSqftPaise: null,
    pricePerSqftMasked,
  };
}
