import type { SVGProps } from "react";

/**
 * Shared small icon set — hand-rolled inline SVG (no icon-library dependency,
 * consistent with the rest of the app), consistent viewBox/strokeWidth/sizing
 * defaults. Replaces the literal Unicode glyphs (← → ✕ /) that were
 * standing in for icons across Pagination/Breadcrumbs/ActiveFilters/modals.
 */

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconSearch({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M21 21l-4.35-4.35m0 0a7.5 7.5 0 10-10.6 0 7.5 7.5 0 0010.6 0z" />
    </svg>
  );
}

export function IconChevronLeft({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function IconChevronRightSmall({ className = "h-3 w-3", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function IconChevronDown({ className = "h-3.5 w-3.5", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconClose({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function IconInfo({ className = "h-3.5 w-3.5", ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" strokeLinecap="round" />
    </svg>
  );
}

/** Scalloped badge + checkmark — the familiar "verified" shape (Twitter/Instagram-style), used here strictly as a PROFILE COMPLETION indicator, never identity/KYC verification. Fill uses currentColor so callers control the (blue/accent) color via text-*. */
export function IconVerifiedBadge({ className = "h-4 w-4", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M12 1.5l2.4 1.6 2.85-.53 1.2 2.65 2.65 1.2-.53 2.85L22.5 12l-1.93 2.13.53 2.85-2.65 1.2-1.2 2.65-2.85-.53L12 22.5l-2.4-1.6-2.85.53-1.2-2.65-2.65-1.2.53-2.85L1.5 12l1.93-2.13-.53-2.85 2.65-1.2 1.2-2.65 2.85.53L12 1.5z"
      />
      <path d="M8.2 12.3l2.4 2.4 5-5.4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
