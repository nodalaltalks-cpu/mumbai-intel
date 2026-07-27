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
