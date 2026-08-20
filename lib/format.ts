import { POSSESSION_MONTH_LABEL } from "@/lib/project-meta";

export function formatPaise(paise: number | bigint | null | undefined): string {
  if (paise === null || paise === undefined) return "--";
  const rupees = Number(paise) / 100;
  if (rupees === 0) return "--";
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function formatPriceBand(
  min: number | bigint | null | undefined,
  max: number | bigint | null | undefined
): string {
  if (!min && !max) return "Price on request";
  if (min && max && Number(min) !== Number(max)) {
    return `${formatPaise(min)} – ${formatPaise(max)}`;
  }
  return formatPaise(min ?? max);
}

/** "Price From" card line — same bands as formatPaise but spells out "Lakhs" (vs. "L") per the card design spec. */
export function formatPriceFrom(paise: number | bigint | null | undefined): string | null {
  if (paise === null || paise === undefined) return null;
  const rupees = Number(paise) / 100;
  if (rupees <= 0) return null;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (rupees >= 1e5) return `₹${Math.round(rupees / 1e5)} Lakhs`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

export function formatPricePerSqft(paise: number | bigint | null | undefined): string {
  if (paise === null || paise === undefined) return "--";
  const rupees = Number(paise) / 100;
  if (rupees === 0) return "--";
  return `₹${Math.round(rupees).toLocaleString("en-IN")}/sqft`;
}

export function formatSqft(sqft: number | null | undefined): string {
  if (sqft === null || sqft === undefined) return "--";
  return `${Math.round(sqft).toLocaleString("en-IN")} sqft`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCompactCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

export function formatSignedPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return "--";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "--";
  return DATE_FORMATTER.format(new Date(date));
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** "19 Aug 2026 · 14:35 IST" — used wherever an exact moment matters (report/communication history), not just the day. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "--";
  return `${DATE_TIME_FORMATTER.format(new Date(date))} IST`;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
});

export function formatMonth(date: Date | string): string {
  return MONTH_FORMATTER.format(new Date(date));
}

type PossessionStatus = "ANNOUNCED" | "PRE_LAUNCH" | "UNDER_CONSTRUCTION" | "NEARING_POSSESSION" | "READY_TO_MOVE" | "DELIVERED" | "STALLED";

/**
 * India-localized possession display — month + year, never a UAE-style
 * quarter ("Q4 2028"). `possessionMonth`/`possessionYear` are the
 * authoritative source (Project.possessionMonth/possessionYear); `legacyDate`
 * is promisedPossession, used only as a fallback for records created before
 * those fields existed — still rendered as month + year, never as a raw date
 * or a quarter.
 */
export function formatPossessionMonthYear(
  possessionMonth: number | null | undefined,
  possessionYear: number | null | undefined,
  status: PossessionStatus,
  legacyDate?: Date | string | null
): string {
  if (status === "READY_TO_MOVE" || status === "DELIVERED") return "Ready to Move";
  if (possessionMonth && possessionYear) return `${POSSESSION_MONTH_LABEL[possessionMonth]} ${possessionYear}`;
  if (legacyDate) {
    const d = new Date(legacyDate);
    if (!Number.isNaN(d.getTime())) return `${POSSESSION_MONTH_LABEL[d.getMonth() + 1]} ${d.getFullYear()}`;
  }
  return "TBD";
}

/** Prose variant for the project detail page ("Possession in March 2028") — same rules, just wrapped in a sentence when there's an actual date. */
export function formatPossessionSentence(
  possessionMonth: number | null | undefined,
  possessionYear: number | null | undefined,
  status: PossessionStatus,
  legacyDate?: Date | string | null
): string {
  const base = formatPossessionMonthYear(possessionMonth, possessionYear, status, legacyDate);
  return base === "Ready to Move" || base === "TBD" ? base : `Possession in ${base}`;
}

/** Project-card "size" line — "412 Units · 6 Towers · 18 Acres", omitting whichever pieces are missing; null (hide the row) only when all three are. */
export function formatProjectSize(
  totalUnits: number | null | undefined,
  totalTowers: number | null | undefined,
  landAreaAcres: number | null | undefined
): string | null {
  const parts: string[] = [];
  if (totalUnits) parts.push(`${totalUnits.toLocaleString("en-IN")} Units`);
  if (totalTowers) parts.push(`${totalTowers} Tower${totalTowers === 1 ? "" : "s"}`);
  if (landAreaAcres) parts.push(`${landAreaAcres} Acres`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "2 hours ago" / "Yesterday" / falls back to formatDate() beyond a week — used by Continue Research's "Viewed ..." line. */
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(d);
}
