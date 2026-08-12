"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { PremiumGateStateProvider } from "@/lib/premium/gate-context";
import GuestResearchNudge from "./GuestResearchNudge";

const GlobalSignInModal = dynamic(() => import("./GlobalSignInModal"), { ssr: false });

/** Mounted once at the root (app/layout.tsx). Holds the single gate-open state and the one lazy-loaded modal for the entire app. */
export default function PremiumGateProvider({ children, isGuest }: { children: ReactNode; isGuest: boolean }) {
  return (
    <PremiumGateStateProvider>
      {children}
      <GlobalSignInModal />
      <GuestResearchNudge isGuest={isGuest} />
    </PremiumGateStateProvider>
  );
}
