/** Discriminates which premium surface a guest hit — used both for overlay copy context and as the `metadata.feature` analytics dimension. */
export type PremiumFeature =
  | "transaction-history"
  | "builder-analytics"
  | "market-analytics"
  | "locality-analytics"
  | "brochure"
  | "wishlist"
  | "save-search"
  | "reports";

export const PREMIUM_FEATURE_LABEL: Record<PremiumFeature, string> = {
  "transaction-history": "Transaction Intelligence",
  "builder-analytics": "Builder Performance Analytics",
  "market-analytics": "Market Intelligence",
  "locality-analytics": "Locality Intelligence",
  brochure: "Official Brochures",
  wishlist: "Wishlist",
  "save-search": "Saved Searches",
  reports: "Market Reports",
};

export const PREMIUM_CARD_TITLE = "Continue your research";
export const PREMIUM_CARD_SUBTITLE = "Create your free account to unlock verified project intelligence.";

export const PREMIUM_BENEFITS: string[] = [
  "Download official brochures",
  "Exact transaction prices",
  "Save wishlist",
  "Continue research",
  "Recently viewed",
  "Weekly market updates",
  "AI insights (Coming Soon)",
  "Zero spam calls",
  "No sales calls",
  "Phone number not required",
];
