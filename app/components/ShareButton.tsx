"use client";

import { useState } from "react";

/** Web Share API where available (mobile), clipboard-copy fallback everywhere else — no server round-trip needed either way. */
export default function ShareButton({ title, text, className = "" }: { title: string; text?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do without a server round-trip
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wide text-muted transition-colors hover:border-accent hover:text-accent ${className}`}
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
