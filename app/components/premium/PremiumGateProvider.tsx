"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { PremiumGateStateProvider } from "@/lib/premium/gate-context";

const GlobalSignInModal = dynamic(() => import("./GlobalSignInModal"), { ssr: false });

/** Mounted once at the root (app/layout.tsx). Holds the single gate-open state and the one lazy-loaded modal for the entire app. */
export default function PremiumGateProvider({ children }: { children: ReactNode }) {
  return (
    <PremiumGateStateProvider>
      {children}
      <GlobalSignInModal />
    </PremiumGateStateProvider>
  );
}
