"use client";

import { trackResearchEvent } from "@/lib/track-research";

/**
 * Opens WhatsApp's own share sheet (wa.me) with the project URL and a fixed,
 * research-first message — never reads or stores the recipient's WhatsApp
 * number; this only prefills a message the visitor chooses who to send to.
 */
export default function WhatsAppShareButton({
  projectId,
  projectName,
  projectSlug,
}: {
  projectId: string;
  projectName: string;
  projectSlug: string;
}) {
  function handleShare() {
    const url = `${window.location.origin}/projects/${projectSlug}`;
    const message = `Check out ${projectName} on NoDalalTalks: independent real estate intelligence, pricing, project details and market data. ${url}`;
    const shareId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());

    trackResearchEvent("WHATSAPP_SHARE_CLICKED", "Project", projectId, {
      source: "whatsapp",
      device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      referringPage: window.location.pathname,
      shareId,
    });

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share on WhatsApp"
      className="flex items-center gap-1.5 rounded-sm border border-positive/40 bg-positive/10 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-positive transition-colors hover:bg-positive/20"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.005c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0 0 12.04 2Zm5.8 14.09c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.11 1-2.4.26-.29.58-.36.77-.36.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.29.15.46.13.63-.05.17-.19.72-.84.92-1.13.19-.29.38-.24.64-.14.26.1 1.65.78 1.94.92.29.15.48.22.55.34.07.13.07.72-.17 1.4Z" />
      </svg>
      WhatsApp
    </button>
  );
}
