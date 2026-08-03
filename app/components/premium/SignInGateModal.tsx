"use client";

import Dialog from "@/app/components/ui/Dialog";
import SignInGateCard from "./SignInGateCard";
import type { PremiumFeature } from "@/lib/premium/types";

/** Click-triggered sign-in prompt (Brochure, Wishlist/Save, Save Search) — same card as PremiumGate's inline overlay, just inside the existing shared Dialog primitive instead of a redirect. */
export default function SignInGateModal({
  feature,
  next,
  onClose,
}: {
  feature: PremiumFeature;
  next: string;
  onClose: () => void;
}) {
  return (
    <Dialog title="Sign in required" onClose={onClose}>
      <SignInGateCard feature={feature} next={next} variant="modal" />
    </Dialog>
  );
}
