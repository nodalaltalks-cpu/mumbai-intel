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
        className="inline-flex shrink-0 items-center text-accent"
      >
        <IconVerifiedBadge className="h-5 w-5" />
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
