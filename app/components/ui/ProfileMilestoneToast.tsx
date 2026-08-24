"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useProfileCompletion } from "@/lib/profile-completion-client";

const COPY: Record<number, { title: string; body: string }> = {
  25: { title: "Great start.", body: "Your research profile is 25% complete." },
  50: { title: "Halfway there.", body: "A few more details will help us personalize your research." },
  75: { title: "Almost there.", body: "Your research profile is 75% complete." },
  90: { title: "Just a little more.", body: "Your research profile is 90% complete." },
  100: {
    title: "Profile complete.",
    body: "Your research profile is 100% complete. NoDalalTalks can now make your property research much more relevant to you.",
  },
};

// Fixed, deterministic set (not Math.random on every render) — a handful of
// small pieces is enough for "tasteful," not a confetti cannon. Colors reuse
// the app's own accent/positive palette, nothing new introduced.
const CONFETTI_PIECES = [
  { left: "8%", delay: "0ms", x: "-10px", rotate: "140deg", color: "var(--accent)" },
  { left: "20%", delay: "40ms", x: "6px", rotate: "220deg", color: "var(--positive)" },
  { left: "33%", delay: "10ms", x: "-4px", rotate: "180deg", color: "var(--accent)" },
  { left: "46%", delay: "70ms", x: "12px", rotate: "260deg", color: "var(--positive)" },
  { left: "58%", delay: "20ms", x: "-14px", rotate: "160deg", color: "var(--accent)" },
  { left: "70%", delay: "60ms", x: "4px", rotate: "240deg", color: "var(--positive)" },
  { left: "82%", delay: "30ms", x: "-8px", rotate: "200deg", color: "var(--accent)" },
  { left: "92%", delay: "80ms", x: "10px", rotate: "280deg", color: "var(--positive)" },
] as const;

/** Subtle for 25/50/75/90; the 100% milestone gets a brief confetti burst + a Continue Research CTA — genuinely rewarding without being childish, slow, or a full-screen takeover. Fires at most once per milestone per user (dedup lives in the provider). */
export default function ProfileMilestoneToast() {
  const { celebration, dismissCelebration } = useProfileCompletion();

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(dismissCelebration, celebration === 100 ? 6000 : 5000);
    return () => clearTimeout(t);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;
  const copy = COPY[celebration];
  const isComplete = celebration === 100;

  return (
    <div
      role="status"
      className="mi-pop-in fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm overflow-hidden rounded-md border border-accent/30 bg-surface p-3.5 shadow-2xl sm:bottom-6 sm:left-6 sm:right-auto"
    >
      {isComplete
        ? CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="mi-confetti-piece"
              style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color, "--mi-confetti-x": p.x, "--mi-confetti-rotate": p.rotate } as React.CSSProperties}
            />
          ))
        : null}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold text-foreground">{isComplete ? "🎉 " : ""}{copy.title}</p>
          <p className="mt-0.5 text-xs text-muted">{copy.body}</p>
          {isComplete ? (
            <Link
              href="/projects"
              onClick={dismissCelebration}
              className="mt-2 inline-block rounded-sm bg-accent px-2.5 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
            >
              Continue research
            </Link>
          ) : null}
        </div>
        <button type="button" onClick={dismissCelebration} aria-label="Dismiss" className="shrink-0 text-muted hover:text-foreground">
          ✕
        </button>
      </div>
    </div>
  );
}
