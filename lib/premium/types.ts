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

export const PREMIUM_CARD_TITLE = "Unlock Complete Property Intelligence";
export const PREMIUM_CARD_SUBTITLE =
  "Create your FREE account to access verified market intelligence. No phone number. No spam calls. No sales follow-up.";

export const PREMIUM_BENEFITS: string[] = [
  "Download Official Brochures",
  "Exact Transaction Prices",
  "Save Wishlist",
  "Continue Research Across Devices",
  "Recently Viewed Projects",
  "Weekly Market Intelligence",
  "AI Insights (Coming Soon)",
  "Zero Spam Calls",
  "No Sales Follow-up",
  "Phone Number Not Required",
];
