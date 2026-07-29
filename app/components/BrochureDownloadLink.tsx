"use client";

import { toDocumentDownloadUrl } from "@/lib/document-url";
import { trackBrochureEvent } from "@/lib/track-brochure";

/**
 * The one place a brochure download link is actually rendered — used by
 * ProjectCard, the project detail page, Compare, Wishlist and Continue
 * Research, so every surface gets the forced-download URL and funnel
 * tracking for free instead of five copies of the same onClick handler.
 */
export default function BrochureDownloadLink({
  slug,
  brochureUrl,
  brochureFileName,
  className,
  children,
}: {
  slug: string;
  brochureUrl: string;
  brochureFileName?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={toDocumentDownloadUrl(brochureUrl, brochureFileName ?? `${slug}-brochure.pdf`)}
      className={className}
      onClick={() => {
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
