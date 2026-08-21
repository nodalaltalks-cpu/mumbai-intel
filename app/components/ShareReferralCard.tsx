"use client";

import { useEffect, useState } from "react";
import { trackResearchEvent } from "@/lib/track-research";

/**
 * "Share NoDalalTalks" — the general referral CTA (distinct from the
 * per-project WhatsAppShareButton on project pages). Every link carries this
 * user's own referralCode + a ?src= channel tag, both read by proxy.ts on
 * first landing and resolved to referredByUserId/referralSource at signup.
 */
export default function ShareReferralCard({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  // navigator is undefined during SSR -- checking it inline in the render
  // would make the server and client markup disagree on whether this button
  // exists (a hydration mismatch). Deciding after mount instead means the
  // button starts absent (matching SSR) and only appears once we can be sure
  // the client actually supports the Web Share API.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  function buildLink(channel: string): string {
    return `${window.location.origin}/?ref=${referralCode}&src=${channel}`;
  }

  function fireShareInitiated(channel: string) {
    trackResearchEvent("REFERRAL_SHARE_INITIATED", undefined, undefined, { channel });
  }

  function handleWhatsApp() {
    const url = buildLink("whatsapp");
    const message = `Know someone researching property in Mumbai? Check out NoDalalTalks: independent real estate intelligence, no forced phone number, no spam calls. ${url}`;
    fireShareInitiated("whatsapp");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  async function handleCopyLink() {
    const url = buildLink("copy_link");
    fireShareInitiated("copy_link");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do without a server round-trip
    }
  }

  async function handleNativeShare() {
    const url = buildLink("native_share");
    fireShareInitiated("native_share");
    try {
      await navigator.share({ title: "NoDalalTalks", text: "Independent real estate intelligence for Mumbai.", url });
    } catch {
      // user cancelled the native share sheet — not an error
    }
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <p className="font-mono text-sm font-semibold text-foreground">Share NoDalalTalks</p>
      <p className="mt-1 text-xs text-muted">Know someone researching property in Mumbai? Share NoDalalTalks with them.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleWhatsApp}
          className="flex items-center gap-1.5 rounded-sm border border-positive/40 bg-positive/10 px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-positive transition-colors hover:bg-positive/20"
        >
          WhatsApp
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? "Link copied" : "Copy Link"}
        </button>
        {canNativeShare ? (
          <button
            type="button"
            onClick={handleNativeShare}
            className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Share
          </button>
        ) : null}
      </div>
    </div>
  );
}
