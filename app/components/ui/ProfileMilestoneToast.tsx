"use client";

import { useEffect } from "react";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const COPY: Record<number, { title: string; body: string }> = {
  25: { title: "Great start.", body: "Your research profile is 25% complete." },
  50: { title: "Halfway there.", body: "A few more details will help us personalize your research." },
  75: { title: "Almost there.", body: "Your research profile is 75% complete." },
  90: { title: "Just a little more.", body: "Your research profile is 90% complete." },
  100: { title: "Research profile complete.", body: "We'll use your preferences to make your property research more relevant." },
};

/** Subtle, dismissible, auto-hides — fires at most once per milestone per user (dedup lives in the provider). No confetti, no full-screen takeover, matching the "premium, not childish" brief. */
export default function ProfileMilestoneToast() {
  const { celebration, dismissCelebration } = useProfileCompletion();

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(dismissCelebration, 5000);
    return () => clearTimeout(t);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;
  const copy = COPY[celebration];

  return (
    <div
      role="status"
      className="mi-pop-in fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm rounded-md border border-accent/30 bg-surface p-3.5 shadow-2xl sm:bottom-6 sm:left-6 sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold text-foreground">{copy.title}</p>
          <p className="mt-0.5 text-xs text-muted">{copy.body}</p>
        </div>
        <button type="button" onClick={dismissCelebration} aria-label="Dismiss" className="shrink-0 text-muted hover:text-foreground">
          ✕
        </button>
      </div>
    </div>
  );
}
