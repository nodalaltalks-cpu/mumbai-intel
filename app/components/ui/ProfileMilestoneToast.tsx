"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useProfileCompletion } from "@/lib/profile-completion-client";

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

/**
 * Two distinct celebration moments (Section 12/13): a noticeable but
 * still-transient toast when one section (Personal Details, Budget, ...)
 * genuinely completes, and a materially bigger, centered, premium moment the
 * one time the whole profile reaches 100% — large enough to register, not a
 * repeat of the small corner toast, dismissible either way and never a
 * blocking full-screen takeover.
 */
export default function ProfileMilestoneToast() {
  const { celebration, dismissCelebration } = useProfileCompletion();

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(dismissCelebration, celebration.kind === "complete" ? 8000 : 5500);
    return () => clearTimeout(t);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  if (celebration.kind === "complete") {
    return (
      <div
        role="status"
        className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 px-4 pb-20 sm:items-center sm:pb-4"
        onClick={dismissCelebration}
      >
        <div
          className="mi-pop-in relative w-full max-w-sm overflow-hidden rounded-lg border border-accent/30 bg-surface p-6 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="mi-confetti-piece"
              style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color, "--mi-confetti-x": p.x, "--mi-confetti-rotate": p.rotate } as React.CSSProperties}
            />
          ))}
          <button
            type="button"
            onClick={dismissCelebration}
            aria-label="Dismiss"
            className="absolute right-3 top-3 text-muted hover:text-foreground"
          >
            ✕
          </button>
          <p className="text-4xl">🎉</p>
          <p className="mt-3 font-mono text-lg font-bold uppercase tracking-wide text-foreground">Your research profile is complete</p>
          <p className="mt-2 font-mono text-3xl font-bold text-accent">100%</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            You&apos;ve given us everything we need to make your property research much more relevant to you.
          </p>
          <Link
            href="/projects"
            onClick={dismissCelebration}
            className="mt-5 inline-block rounded-sm bg-accent px-5 py-2.5 text-xs font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
          >
            Continue research
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mi-pop-in fixed inset-x-4 bottom-20 z-40 mx-auto max-w-sm overflow-hidden rounded-md border border-accent/30 bg-surface p-4 shadow-2xl sm:bottom-6 sm:left-6 sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🎉
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold text-foreground">{celebration.label} complete</p>
          <p className="mt-0.5 text-xs text-muted">One step closer to a fully personalized research profile.</p>
        </div>
        <button type="button" onClick={dismissCelebration} aria-label="Dismiss" className="shrink-0 text-muted hover:text-foreground">
          ✕
        </button>
      </div>
    </div>
  );
}
