"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

/**
 * Single app-wide source of truth for the sign-in gate: whichever surface
 * calls openGate() last wins, so only one <GlobalSignInModal> can ever be
 * open at a time no matter how many gated sections exist on a page.
 */
export function PremiumGateStateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<GateRequest | null>(null);

  const openGate = useCallback((feature: PremiumFeature, next: string, trigger: "inline" | "modal" = "modal") => {
    setRequest({ feature, next, trigger });
  }, []);
  const closeGate = useCallback(() => setRequest(null), []);

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
