/** Shared by every page that displays a NotificationCampaign's category (Notifications, its campaign detail page, Notification Analytics) so "OTHER" consistently renders the founder's own custom label instead of the raw enum value. */
export const NOTIFICATION_CATEGORY_LABEL: Record<string, string> = {
  NEW_LAUNCH: "New Launch",
  PRICE_OFFER: "Price / Offer",
  TRENDING_LOCALITY: "Trending Locality",
  NEW_REPORT: "New Report",
  MARKET_INSIGHT: "Market Insight",
  TRANSACTION_DATA: "Transaction Data",
  SAVED_SEARCH_ANNOUNCEMENT: "Saved Search",
  PRODUCT_UPDATE: "Product Update",
  GENERAL_UPDATE: "General Update",
  OTHER: "Other",
};

export function formatNotificationCategory(category: string, customCategory?: string | null): string {
  if (category === "OTHER" && customCategory) return customCategory;
  return NOTIFICATION_CATEGORY_LABEL[category] ?? category;
}
