"use client";

import { useState } from "react";
import Dialog from "@/app/components/ui/Dialog";
import { IconVerifiedBadge } from "@/app/components/ui/icons";

/**
 * A PROFILE COMPLETION badge, not identity/phone/KYC verification -- shown
 * only once profileCompletionPercent reaches 100 (server-computed, passed in
 * as `complete`), and removed automatically the next time this renders with
 * `complete=false` (e.g. after profile-completion recalculation following an
 * edit). No client-side completion logic lives here.
 */
export default function VerifiedProfileBadge({ complete }: { complete: boolean }) {
  const [open, setOpen] = useState(false);
  if (!complete) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Profile complete — tap to learn more"
        className="inline-flex shrink-0 items-center"
      >
        {/* color set on the svg itself, not the button -- globals.css's unlayered
            `button, input, select, textarea { color: inherit }` reset always wins
            over a layered Tailwind text-* utility placed on the <button> element,
            silently forcing it back to the inherited foreground color. svg isn't
            in that reset list, so text-accent resolves correctly placed here. */}
        <IconVerifiedBadge className="h-5 w-5 text-accent" />
      </button>
      {open ? (
        <Dialog title="Profile verified" onClose={() => setOpen(false)}>
          <p className="text-sm font-medium text-foreground">Your profile is 100% complete.</p>
          <p className="mt-2 text-xs text-muted">
            Complete profiles help us personalize your property research and recommendations.
          </p>
          <p className="mt-3 text-[11px] text-muted">This reflects profile completion only — not identity, phone, or KYC verification.</p>
        </Dialog>
      ) : null}
    </>
  );
}
