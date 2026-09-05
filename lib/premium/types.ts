/** Discriminates which premium surface a guest hit — used both for overlay copy context and as the `metadata.feature` analytics dimension. */
export type PremiumFeature =
  | "transaction-history"
  | "builder-analytics"
  | "market-analytics"
  | "locality-analytics"
  | "wishlist"
  | "save-search"
  | "reports"
  | "direct-signin"
  | "research-nudge";

export const PREMIUM_FEATURE_LABEL: Record<PremiumFeature, string> = {
  "transaction-history": "Transaction Intelligence",
  "builder-analytics": "Builder Performance Analytics",
  "market-analytics": "Market Intelligence",
  "locality-analytics": "Locality Intelligence",
  wishlist: "Wishlist",
  "save-search": "Saved Searches",
  reports: "Market Reports",
  "direct-signin": "Sign In (Nav)",
  "research-nudge": "60s Guest Nudge",
};

export const PREMIUM_CARD_TITLE = "Continue Your Research";
export const PREMIUM_CARD_SUBTITLE = "Create your free account to unlock powerful real estate research tools.";

/**
 * What's actually locked, in plain language — shown instead of the generic
 * subtitle whenever a specific feature triggered the gate (Section 3: "clearly
 * explain what is locked"). "direct-signin"/"research-nudge" have no single
 * locked feature behind them (nav sign-in button; a general guest nudge), so
 * they keep the generic PREMIUM_CARD_SUBTITLE instead of getting an entry here.
 */
export const PREMIUM_FEATURE_SUBTITLE: Partial<Record<PremiumFeature, string>> = {
  "transaction-history": "Sign in free to see full transaction history — every registered price, not just a preview.",
  "builder-analytics": "Sign in free to see builder performance analytics — delivery track record, project history and trust scores.",
  "market-analytics": "Sign in free to see full market intelligence — price trends, locality benchmarks and builder rankings.",
  "locality-analytics": "Sign in free to see full locality intelligence — pricing, growth and rental yield data.",
  wishlist: "Sign in free to save this and revisit it anytime from your account.",
  "save-search": "Sign in free to save this search and get notified about new matches.",
  reports: "Sign in free to view the full market report.",
};

/** Phase 68 — "Download Official Project Brochures" removed: brochure downloads are free and ungated for every visitor, signed in or not, so it's no longer a sign-in incentive. */
export const PREMIUM_BENEFITS: string[] = [
  "No Phone Number Required",
  "No Spam Calls Ever",
  "Save Favourite Projects",
  "Track Your Research Across Devices",
  "100% Free Account",
];
