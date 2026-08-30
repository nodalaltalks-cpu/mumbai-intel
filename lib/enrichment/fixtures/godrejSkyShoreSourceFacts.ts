import type { SourceFactsMap, SourceMeta } from "../types";

/**
 * Godrej Sky Shore official-source facts — Phase 28 acceptance-test fixture.
 *
 * This is a MANUALLY VERIFIED SNAPSHOT of what was actually found on
 * godrejproperties.com/mumbai/residential/godrej-skyshore during the
 * real, human-supervised inspections in Phases 16, 26, and 27 (each
 * cross-checked against a fresh re-fetch) — NOT a live scrape performed by
 * this module. No automated fetcher is wired into application code this
 * phase (see this project's OfficialSourceAdapter interface for where a
 * future live implementation would plug in). Every value here is quoted or
 * paraphrased from that real, cited source.
 */
export const GODREJ_SKY_SHORE_SOURCE_META: SourceMeta = {
  url: "https://www.godrejproperties.com/mumbai/residential/godrej-skyshore",
  tier: "OFFICIAL_DEVELOPER",
};

export const GODREJ_SKY_SHORE_SOURCE_FACTS: SourceFactsMap = {
  name: { value: "Godrej Skyshore", confidence: "High" },
  developerGroup: { value: "Godrej Properties Ltd.", confidence: "High" },
  category: { value: "Residential", confidence: "High" },
  status: { value: "Under Construction", confidence: "Low", note: "Implied only from a future possession date, not an explicit label on the page." },
  locality: { value: "Andheri West", confidence: "High" },
  priceMin: { value: "₹8.40 Cr", confidence: "High" },
  priceMax: { value: "₹11.89 Cr", confidence: "High" },
  possessionMonth: { value: "February", confidence: "High" },
  possessionYear: { value: "2030", confidence: "High" },
  address: {
    value: "Sales Lounge, CTS No. 1165-1172/1-4, Versova, Andheri, Mumbai Suburban 400061",
    confidence: "Medium",
    ambiguous: true,
    note: "Labeled \"Sales Lounge\" on the source page — may be the sales office address rather than the registered project address. Confirm before treating as final.",
  },
  landAreaAcres: {
    value: "1.8 acres",
    confidence: "Medium",
    ambiguous: true,
    note: "Stated in flowing blog prose (\"this 1.8-acre residential address\"), not a structured spec sheet. Confirm before treating as an exact figure.",
  },
  tagline: {
    value: "A shoreline sanctuary shaped by the timeless dance of earth and sea",
    confidence: "Medium",
    ambiguous: true,
    note: "Drafted from marketing copy — needs editorial shortening/approval, not a verbatim fact.",
  },
  highlights: {
    value: "Distance highlights (Airport 18 min, Kokilaben Hospital 5 min, Versova Metro 4 min, etc.) plus project highlights prose",
    confidence: "Medium",
    ambiguous: true,
    note: "Raw marketing/location content — needs curation into discrete bullet points before use.",
  },
  amenities: {
    value: "9 selected",
    confidence: "High",
    ambiguous: true,
    note: "A real, named list (Kids' Play Area, Jogging Track, Gymnasium, Squash Court, Library, Padel Court, Hammock Bay & Lounge, Party Deck, Multipurpose Sports Court) — high-confidence content, but still routed to human confirmation before publishing, per Phase 27's own determination.",
  },
  faqs: {
    value: "2 listed",
    confidence: "Medium",
    ambiguous: true,
    note: "An FAQ section exists on the developer's blog; only the questions were captured, not the full answer text.",
  },
  coverImage: {
    value: "Hero image present on the official page",
    confidence: "Medium",
    ambiguous: true,
    note: "Publicly visible, but image rights/licensing were never cleared — do not use without a rights decision.",
  },
  images: {
    value: "Gallery tab present (count not enumerated)",
    confidence: "Medium",
    ambiguous: true,
    note: "Same rights caveat as coverImage.",
  },
  metaTitle: {
    value: "Godrej Skyshore Versova Mumbai | 4 bed regal residences starting at ₹11.89 Cr+",
    confidence: "High",
  },
  metaDescription: {
    value:
      "Discover Godrej Skyshore in Versova, Andheri West, Mumbai. Explore 4 bed regal residences starting at ₹11.89 Cr+ with premium amenities, expansive decks, exceptional connectivity, and an iconic coastal lifestyle.",
    confidence: "High",
  },
  // Deliberately NOT included (no fact provided → correctly classifies MISSING):
  // reraNumber, reraStatus, reraCertificateUrl, brochure, documents, videoUrl,
  // tour360Url, specifications, totalUnits, totalTowers, launchDate,
  // actualPossession, constructionPercent, googleMapsUrl, latitude, longitude,
  // microMarket, builder, paymentPlanType, paymentPlanDescription, ogImageUrl,
  // description (see this fixture file's own note below on why).
  //
  // "description" is deliberately omitted too: the official site has a
  // materially richer description than the current staged one, but this is a
  // "better prose, same topic" case the blunt CONFIRMED/CONFLICT string-diff
  // isn't well suited to (it would either falsely CONFIRM two different
  // strings' worth of detail, or noisily CONFLICT over a non-contradiction).
  // Best left to human editorial judgment -- reported as a known limitation,
  // not forced through this MVP's rules.
};
