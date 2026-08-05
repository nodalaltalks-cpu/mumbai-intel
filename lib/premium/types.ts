/** Discriminates which premium surface a guest hit — used both for overlay copy context and as the `metadata.feature` analytics dimension. */
export type PremiumFeature =
  | "transaction-history"
  | "builder-analytics"
  | "market-analytics"
  | "locality-analytics"
  | "brochure"
  | "wishlist"
  | "save-search"
  | "reports"
  | "direct-signin";

export const PREMIUM_FEATURE_LABEL: Record<PremiumFeature, string> = {
  "transaction-history": "Transaction Intelligence",
  "builder-analytics": "Builder Performance Analytics",
  "market-analytics": "Market Intelligence",
  "locality-analytics": "Locality Intelligence",
  brochure: "Official Brochures",
  wishlist: "Wishlist",
  "save-search": "Saved Searches",
  reports: "Market Reports",
  "direct-signin": "Sign In (Nav)",
};

export const PREMIUM_CARD_TITLE = "Continue Your Research";
export const PREMIUM_CARD_SUBTITLE = "Create your free account to unlock powerful real estate research tools.";

export const PREMIUM_BENEFITS: string[] = [
  "No Phone Number Required",
  "No Spam Calls Ever",
  "Save Favourite Projects",
  "Download Official Project Brochures",
  "Track Your Research Across Devices",
  "100% Free Account",
];
