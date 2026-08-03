"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { toDocumentDownloadUrl } from "@/lib/document-url";
import { trackBrochureEvent } from "@/lib/track-brochure";
import { usePremiumGate } from "@/lib/premium/gate-context";

/**
 * The one place a brochure download link is actually rendered — used by
 * ProjectCard, the project detail page, Compare, Wishlist and Continue
 * Research, so every surface gets the forced-download URL and funnel
 * tracking for free instead of five copies of the same onClick handler.
 *
 * IMPORTANT — gating contract: this is a Client Component, so ANY prop
 * passed to it is serialized into the page's hydration payload and
 * present in guest-viewable HTML, regardless of which internal branch
 * actually renders. There is deliberately no separate `locked` boolean —
 * the caller (a Server Component that knows the real session) must pass
 * `brochureUrl={null}` when the viewer is locked out, never the real URL
 * alongside a flag. `brochureUrl === null` is what shows the sign-in-gate
 * button instead of a real download anchor.
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
  const { openGate } = usePremiumGate();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const next = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;

  if (!brochureUrl) {
    return (
      <button type="button" onClick={() => openGate("brochure", next)} className={className}>
        {children}
      </button>
    );
  }

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
