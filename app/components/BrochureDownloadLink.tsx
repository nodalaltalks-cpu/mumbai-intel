"use client";

import { trackBrochureEvent } from "@/lib/track-brochure";
import { trackBrochureClicked } from "@/lib/analytics/ga";

/**
 * The one place a brochure download link is actually rendered — used by
 * ProjectCard, the project detail page, Compare, Wishlist and Continue
 * Research, so every surface gets the forced-download URL and funnel
 * tracking for free instead of five copies of the same onClick handler.
 *
 * Phase 68 — brochure downloads are completely free and ungated: there is no
 * sign-in requirement here at all, for anyone. `brochureUrl === null` means
 * exactly one thing now — no brochure has been uploaded for this project —
 * so callers should simply not render this component in that case (every
 * current call site already guards on `brochureUrl`/`brochureAvailable`
 * before rendering); this returns null itself as a defensive fallback rather
 * than ever showing a broken download control.
 */
export default function BrochureDownloadLink({
  slug,
  brochureUrl,
  brochureFileName,
  className,
  children,
}: {
  slug: string;
  brochureUrl: string | null;
  brochureFileName?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!brochureUrl) return null;

  const downloadFileName = brochureFileName ?? `${slug}-brochure.pdf`;
  const downloadHref = `/api/brochure-download?url=${encodeURIComponent(brochureUrl)}&filename=${encodeURIComponent(downloadFileName)}`;

  return (
    <a
      href={downloadHref}
      className={className}
      onClick={() => {
        trackBrochureClicked(slug);
        trackBrochureEvent(slug, "DOWNLOAD_STARTED");
        // A plain anchor download has no reliable "finished" browser event, so
        // COMPLETED is fired alongside STARTED at click time — a disclosed
        // simplification (see brochure analytics summary), not a hidden gap.
        trackBrochureEvent(slug, "DOWNLOAD_COMPLETED");
      }}
    >
      {children}
    </a>
  );
}
