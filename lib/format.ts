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

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "2-digit",
});

export function formatMonth(date: Date | string): string {
  return MONTH_FORMATTER.format(new Date(date));
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
