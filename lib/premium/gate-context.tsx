"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { trackGuestPaywallTriggered } from "@/lib/analytics/ga";
import type { PremiumFeature } from "./types";

interface GateRequest {
  feature: PremiumFeature;
  next: string;
  trigger: "inline" | "modal";
}

interface GateContextValue {
  request: GateRequest | null;
  openGate: (feature: PremiumFeature, next: string, trigger?: "inline" | "modal") => void;
  closeGate: () => void;
}

const GateContext = createContext<GateContextValue | null>(null);

/** A guest who dismisses the modal for a given feature won't be re-shown it for this long if they click the *same* feature again — avoids nagging on repeat clicks while a click on a different feature still opens it immediately. */
const DISMISS_COOLDOWN_MS = 5 * 60 * 1000;

/** Explicit "I want to sign in" entry points — a deliberate re-click here is always intent, never incidental nagging, so the cooldown above must never suppress it (unlike an accidental repeat click on a blurred data section). */
const COOLDOWN_EXEMPT_FEATURES: PremiumFeature[] = ["direct-signin"];

/**
 * Single app-wide source of truth for the sign-in gate: whichever surface
 * calls openGate() last wins, so only one <GlobalSignInModal> can ever be
 * open at a time no matter how many gated sections exist on a page.
 */
export function PremiumGateStateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<GateRequest | null>(null);
  const lastDismissed = useRef<{ feature: PremiumFeature; at: number } | null>(null);

  const openGate = useCallback((feature: PremiumFeature, next: string, trigger: "inline" | "modal" = "modal") => {
    const dismissed = lastDismissed.current;
    const cooldownApplies = !COOLDOWN_EXEMPT_FEATURES.includes(feature);
    if (cooldownApplies && dismissed && dismissed.feature === feature && Date.now() - dismissed.at < DISMISS_COOLDOWN_MS) return;
    trackGuestPaywallTriggered(feature);
    setRequest({ feature, next, trigger });
  }, []);
  const closeGate = useCallback(() => {
    setRequest((current) => {
      if (current) lastDismissed.current = { feature: current.feature, at: Date.now() };
      return null;
    });
  }, []);

  const value = useMemo(() => ({ request, openGate, closeGate }), [request, openGate, closeGate]);

  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function usePremiumGate(): { openGate: GateContextValue["openGate"] } {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("usePremiumGate must be used within PremiumGateStateProvider");
  return { openGate: ctx.openGate };
}

/** Internal — only GlobalSignInModal reads the full request + close. */
export function useGateRequest(): Pick<GateContextValue, "request" | "closeGate"> {
  const ctx = useContext(GateContext);
  if (!ctx) throw new Error("useGateRequest must be used within PremiumGateStateProvider");
  return { request: ctx.request, closeGate: ctx.closeGate };
}
