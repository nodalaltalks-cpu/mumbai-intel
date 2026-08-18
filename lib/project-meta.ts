export const PROJECT_STATUSES = [
  "ANNOUNCED",
  "PRE_LAUNCH",
  "UNDER_CONSTRUCTION",
  "NEARING_POSSESSION",
  "READY_TO_MOVE",
  "DELIVERED",
  "STALLED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROPERTY_CATEGORIES = ["RESIDENTIAL", "COMMERCIAL", "PLOT", "MIXED_USE"] as const;
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];

/** India-localized possession month — index 0 unused so POSSESSION_MONTH_LABEL[possessionMonth] works directly against the 1–12 values stored on Project.possessionMonth. */
export const POSSESSION_MONTH_LABEL: readonly string[] = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const PAYMENT_PLAN_TYPES = [
  "CONSTRUCTION_LINKED",
  "BUILDER_SUBVENTION",
  "BANK_SUBVENTION",
  "DOWN_PAYMENT",
  "FLEXI_PAYMENT",
  "NO_PAYMENT_PLAN",
] as const;
export type PaymentPlanType = (typeof PAYMENT_PLAN_TYPES)[number];

export const PAYMENT_PLAN_TYPE_LABEL: Record<PaymentPlanType, string> = {
  CONSTRUCTION_LINKED: "Construction Linked Plan (CLP)",
  BUILDER_SUBVENTION: "Builder Subvention",
  BANK_SUBVENTION: "Bank Subvention",
  DOWN_PAYMENT: "Down Payment",
  FLEXI_PAYMENT: "Flexi Payment",
  NO_PAYMENT_PLAN: "No Payment Plan",
};

/**
 * Auto-fills the admin form's description textarea when a Payment Plan Type
 * is picked (still editable — e.g. to record the actual "10:80:10" split).
 * Also the fallback shown if an existing project has a type but blank
 * description. The stored `paymentPlanDescription` text is always what's
 * actually rendered on the card/detail page — this map never runs at
 * render time, only ever as a starting value.
 */
export const PAYMENT_PLAN_TYPE_DEFAULT_DESCRIPTION: Record<PaymentPlanType, string> = {
  CONSTRUCTION_LINKED: "Payments are made according to construction progress — no separate subvention or income eligibility involved.",
  BUILDER_SUBVENTION: "Builder pays the pre-EMI during the agreed subvention period. No bank income eligibility check required — approval is per the builder's own scheme.",
  BANK_SUBVENTION: "Bank pays the pre-EMI during the agreed subvention period, subject to the buyer's income eligibility and lender approval.",
  DOWN_PAYMENT: "Buyer pays a major portion upfront with the remaining balance as per the agreed schedule.",
  FLEXI_PAYMENT: "Payment is split across booking, construction milestones and possession.",
  NO_PAYMENT_PLAN: "No structured payment plan has been published for this project.",
};

export const DATA_SOURCES = [
  "OFFICIAL_GOVERNMENT",
  "BUILDER_INFORMATION",
  "MANUALLY_VERIFIED",
  "AI_GENERATED",
  "USER_SUBMITTED",
  "EXTERNAL_OPEN_DATA",
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const TRANSACTION_TYPES = ["SALE", "RESALE", "LEASE"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const BUYER_TYPES = ["INDIVIDUAL", "COMPANY"] as const;
export type BuyerTypeValue = (typeof BUYER_TYPES)[number];

export const BUYER_TYPE_LABEL: Record<BuyerTypeValue, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
};

export const USER_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type UserRoleValue = (typeof USER_ROLES)[number];

export const IMAGE_KINDS = ["hero", "gallery", "floorplan", "masterplan", "elevation"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/**
 * The one card-image fallback rule, shared by every list/compare/map query
 * that shows a single thumbnail per project. `sortOrder` is a single
 * upload-order counter across ALL kinds for a project (see
 * lib/actions/images.ts), not scoped per-kind — so a hero image uploaded
 * after some gallery photos can have a *higher* sortOrder than them, and
 * "first by sortOrder" alone would silently pick a gallery photo over the
 * hero. Every caller must fetch images unfiltered by kind (ordered by
 * sortOrder, a small capped `take`) and run them through this picker,
 * mirroring the project detail page's own `find(hero) ?? images[0]` logic.
 */
export function pickCardImageUrl(images: { kind: string; url: string }[]): string | null {
  const url = (images.find((i) => i.kind === "hero") ?? images[0])?.url ?? null;
  return url ? optimizedImageUrl(url, { width: 640, height: 480 }) : null;
}

/**
 * Non-destructive Cloudinary delivery-URL transform — inserts `f_auto,q_auto`
 * (best-format + perceptual-quality auto-optimization, not a fixed harsh
 * compression) plus an optional fill-crop, right into the existing secure_url
 * string. No re-upload, no stored-value change, works retroactively on every
 * already-uploaded image. A plain string transform (not Cloudinary-SDK-
 * dependent), so it's safe to call from both server queries and client code.
 */
export function optimizedImageUrl(url: string, opts: { width?: number; height?: number } = {}): string {
  if (!url.includes("/upload/")) return url;
  const { width, height } = opts;
  const transforms = ["f_auto", "q_auto:good"];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (width && height) transforms.push("c_fill", "g_auto");
  return url.replace("/upload/", `/upload/${transforms.join(",")}/`);
}

export const AMENITY_CATEGORIES = ["RECREATION", "SAFETY", "CONVENIENCE", "WELLNESS", "UTILITIES", "OUTDOOR"] as const;
export type AmenityCategoryValue = (typeof AMENITY_CATEGORIES)[number];

export const AMENITY_CATEGORY_LABEL: Record<AmenityCategoryValue, string> = {
  RECREATION: "Recreation",
  SAFETY: "Safety & Security",
  CONVENIENCE: "Convenience",
  WELLNESS: "Wellness",
  UTILITIES: "Utilities",
  OUTDOOR: "Outdoor",
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  ANNOUNCED: "Announced",
  PRE_LAUNCH: "Pre-Launch",
  UNDER_CONSTRUCTION: "Under Construction",
  NEARING_POSSESSION: "Nearing Possession",
  READY_TO_MOVE: "Ready to Move",
  DELIVERED: "Delivered",
  STALLED: "Stalled",
};

export const STATUS_CLASS: Record<ProjectStatus, string> = {
  ANNOUNCED: "text-info border-info/40 bg-info/10",
  PRE_LAUNCH: "text-info border-info/40 bg-info/10",
  UNDER_CONSTRUCTION: "text-accent border-accent/40 bg-accent/10",
  NEARING_POSSESSION: "text-accent border-accent/40 bg-accent/10",
  READY_TO_MOVE: "text-positive border-positive/40 bg-positive/10",
  DELIVERED: "text-positive border-positive/40 bg-positive/10",
  STALLED: "text-negative border-negative/40 bg-negative/10",
};

/**
 * Project-card "construction status" pill — a deliberately smaller vocabulary
 * (5 labels) than the full STATUS_LABEL/ProjectStatus enum, matching what
 * property-portal cards conventionally show. NEARING_POSSESSION and STALLED
 * have no clean home in that 5-label set, so both fall back to "Under
 * Construction" (closest bucket — still incomplete, not yet ready). "Sold
 * Out" has no data source anywhere in the schema (no inventory/units-sold
 * tracking) and is intentionally never produced by this map.
 */
export const CONSTRUCTION_BADGE_LABEL: Record<ProjectStatus, string> = {
  ANNOUNCED: "Coming Soon",
  PRE_LAUNCH: "New Launch",
  UNDER_CONSTRUCTION: "Under Construction",
  NEARING_POSSESSION: "Under Construction",
  READY_TO_MOVE: "Ready to Move",
  DELIVERED: "Ready to Move",
  STALLED: "Under Construction",
};

/** Soft, low-opacity fills — deliberately calmer than STATUS_CLASS's badge (same tokens, lower opacity) so the card doesn't read as colorful. */
export const CONSTRUCTION_BADGE_CLASS: Record<ProjectStatus, string> = {
  ANNOUNCED: "text-info border-info/20 bg-info/8",
  PRE_LAUNCH: "text-accent border-accent/20 bg-accent/8",
  UNDER_CONSTRUCTION: "text-muted border-border bg-surface-raised",
  NEARING_POSSESSION: "text-muted border-border bg-surface-raised",
  READY_TO_MOVE: "text-positive border-positive/20 bg-positive/8",
  DELIVERED: "text-positive border-positive/20 bg-positive/8",
  STALLED: "text-muted border-border bg-surface-raised",
};

export const STATUS_CHART_COLOR: Record<ProjectStatus, string> = {
  ANNOUNCED: "--chart-2",
  PRE_LAUNCH: "--chart-6",
  UNDER_CONSTRUCTION: "--chart-1",
  NEARING_POSSESSION: "--chart-7",
  READY_TO_MOVE: "--chart-4",
  DELIVERED: "--chart-3",
  STALLED: "--negative",
};

export const CATEGORY_LABEL: Record<PropertyCategory, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  PLOT: "Plot",
  MIXED_USE: "Mixed Use",
};

export const SOURCE_LABEL: Record<DataSource, string> = {
  OFFICIAL_GOVERNMENT: "GOVT VERIFIED",
  BUILDER_INFORMATION: "BUILDER DATA",
  MANUALLY_VERIFIED: "ANALYST VERIFIED",
  AI_GENERATED: "AI ESTIMATE",
  USER_SUBMITTED: "COMMUNITY",
  EXTERNAL_OPEN_DATA: "OPEN DATA",
};

export const SOURCE_CLASS: Record<DataSource, string> = {
  OFFICIAL_GOVERNMENT: "text-positive border-positive/30",
  BUILDER_INFORMATION: "text-info border-info/30",
  MANUALLY_VERIFIED: "text-accent border-accent/30",
  AI_GENERATED: "text-purple-400 border-purple-400/30",
  USER_SUBMITTED: "text-muted border-border",
  EXTERNAL_OPEN_DATA: "text-info border-info/30",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  SALE: "Sale",
  RESALE: "Resale",
  LEASE: "Lease",
};

export const INFRA_TYPES = [
  "METRO_STATION",
  "RAILWAY_STATION",
  "SCHOOL",
  "HOSPITAL",
  "MALL",
  "AIRPORT",
  "ROAD",
  "BUSINESS_DISTRICT",
  "PARK",
  "RESTAURANT",
] as const;
export type InfraTypeValue = (typeof INFRA_TYPES)[number];

export const INFRA_TYPE_LABEL: Record<InfraTypeValue, string> = {
  METRO_STATION: "Metro Station",
  RAILWAY_STATION: "Railway Station",
  SCHOOL: "School",
  HOSPITAL: "Hospital",
  MALL: "Mall",
  AIRPORT: "Airport",
  ROAD: "Major Road",
  BUSINESS_DISTRICT: "Business District / Office Hub",
  PARK: "Park",
  RESTAURANT: "Restaurant",
};

/** Map-marker color per infra type — same --chart-N CSS vars as STATUS_CHART_COLOR. */
export const INFRA_TYPE_CHART_COLOR: Record<InfraTypeValue, string> = {
  METRO_STATION: "--chart-1",
  RAILWAY_STATION: "--chart-6",
  SCHOOL: "--chart-2",
  HOSPITAL: "--chart-3",
  MALL: "--chart-5",
  AIRPORT: "--chart-7",
  ROAD: "--muted",
  BUSINESS_DISTRICT: "--chart-1",
  PARK: "--chart-4",
  RESTAURANT: "--chart-5",
};

export const PROJECT_SORT_OPTIONS = [
  { value: "updated_desc", label: "Recently updated" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "launch_desc", label: "Launch date: Newest" },
  { value: "possession_asc", label: "Possession: Soonest" },
] as const;
export type ProjectSortValue = (typeof PROJECT_SORT_OPTIONS)[number]["value"];

export const CONFIGURATION_FILTER_OPTIONS = [
  { value: "1", label: "1 BHK" },
  { value: "2", label: "2 BHK" },
  { value: "3", label: "3 BHK" },
  { value: "4", label: "4+ BHK" },
] as const;

export const BUILDER_SORT_OPTIONS = [
  { value: "updated_desc", label: "Recently added" },
  { value: "name_asc", label: "Name: A to Z" },
  { value: "founded_asc", label: "Founded: Oldest" },
  { value: "projects_desc", label: "Most projects" },
] as const;
export type BuilderSortValue = (typeof BUILDER_SORT_OPTIONS)[number]["value"];

export const TRANSACTION_SORT_OPTIONS = [
  { value: "date_desc", label: "Latest" },
  { value: "price_desc", label: "Highest Price" },
  { value: "price_asc", label: "Lowest Price" },
  { value: "ppsf_desc", label: "Highest Price/Sq.ft" },
] as const;
export type TransactionSortValue = (typeof TRANSACTION_SORT_OPTIONS)[number]["value"];

export const POSSESSION_FILTER_OPTIONS = [
  { value: "ready", label: "Ready to move" },
  { value: "1yr", label: "Within 1 year" },
  { value: "2yr", label: "Within 2 years" },
  { value: "later", label: "2+ years away" },
] as const;
