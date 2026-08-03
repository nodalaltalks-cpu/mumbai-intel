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

export const PREMIUM_CARD_TITLE = "Unlock Complete Project Intelligence";
export const PREMIUM_CARD_SUBTITLE = "Create your FREE account to access";

export const PREMIUM_BENEFITS: string[] = [
  "Download Official Brochures",
  "Exact Transaction Prices",
  "Compare Projects",
  "Save Wishlist",
  "Continue Research",
  "Recently Viewed",
  "Weekly Market Intelligence",
  "AI Insights (Coming Soon)",
  "Zero Spam Calls",
  "No Sales Calls",
  "Phone Number NOT Required",
];
