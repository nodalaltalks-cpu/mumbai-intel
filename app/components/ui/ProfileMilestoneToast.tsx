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

function Confetti() {
  return (
    <>
      {CONFETTI_PIECES.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="mi-confetti-piece"
          style={{ left: p.left, animationDelay: p.delay, backgroundColor: p.color, "--mi-confetti-x": p.x, "--mi-confetti-rotate": p.rotate } as React.CSSProperties}
        />
      ))}
    </>
  );
}

/**
 * Three distinct celebration moments (Phase 3C Parts 2-4):
 *  - "section": a small, brief corner toast when one section (Personal
 *    Details, Budget, ...) genuinely completes -- unchanged from before.
 *  - "milestone": a materially bigger, centered moment at the 20/40/60/80/90%
 *    UX brackets -- large enough to register and enter from both edges, but
 *    still dismissible and time-limited, never a hard block.
 *  - "complete": the single biggest, full-screen moment at 100%, with a
 *    "Profile Complete" badge that is explicitly NOT a verification badge
 *    (Phone Verified / Email Verified are separate, real, distinct claims
 *    elsewhere in this app -- this one only ever means "every optional field
 *    is filled in").
 */
export default function ProfileMilestoneToast() {
  const { celebration, dismissCelebration } = useProfileCompletion();

  useEffect(() => {
    console.log("[mi-debug] toast sees celebration", celebration);
  }, [celebration]);

  useEffect(() => {
    if (!celebration) return;
    const duration = celebration.kind === "complete" ? 8000 : celebration.kind === "milestone" ? 6000 : 5500;
    const t = setTimeout(dismissCelebration, duration);
    return () => clearTimeout(t);
  }, [celebration, dismissCelebration]);

  if (!celebration) return null;

  if (celebration.kind === "complete") {
    return (
      <div
        role="status"
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
        onClick={dismissCelebration}
      >
        <div
          className="mi-pop-in relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-none border-0 bg-surface p-6 text-center shadow-2xl sm:h-auto sm:max-w-md sm:rounded-lg sm:border sm:border-accent/30 sm:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <Confetti />
          <button
            type="button"
            onClick={dismissCelebration}
            aria-label="Dismiss"
            className="absolute right-4 top-4 text-muted hover:text-foreground"
          >
            ✕
          </button>
          <p className="text-5xl">🎉</p>
          {/* "Profile Complete" -- deliberately distinct from Phone Verified / Email
              Verified badges elsewhere: this claims only that every optional field
              is filled in, never identity/phone/government verification. */}
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive/10 px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-positive">
            <span aria-hidden="true">✓</span> Profile Complete
          </span>
          <p className="mt-4 font-mono text-xl font-bold text-foreground sm:text-2xl">Your research profile is complete</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            NoDalalTalks can now make your research experience more relevant to you.
          </p>
          <Link
            href="/projects"
            onClick={dismissCelebration}
            className="mt-6 inline-block rounded-sm bg-accent px-6 py-3 text-sm font-mono font-semibold uppercase tracking-wide text-white hover:bg-accent-dim"
          >
            Continue research
          </Link>
        </div>
      </div>
    );
  }

  if (celebration.kind === "milestone") {
    return (
      <div
        role="status"
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 px-4"
        onClick={dismissCelebration}
      >
        <div
          className="mi-pop-in relative w-full max-w-md overflow-hidden rounded-lg border border-accent/30 bg-surface p-6 text-center shadow-2xl sm:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          <Confetti />
          <button
            type="button"
            onClick={dismissCelebration}
            aria-label="Dismiss"
            className="absolute right-3 top-3 text-muted hover:text-foreground"
          >
            ✕
          </button>
          {/* Enters from both edges and meets in the center -- two halves of one line. */}
          <div className="flex items-center justify-center gap-2 text-3xl">
            <span className="mi-slide-in-left" aria-hidden="true">
              ✨
            </span>
            <span className="mi-slide-in-right" aria-hidden="true">
              ✨
            </span>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold text-accent">{celebration.percent}%</p>
          <p className="mt-2 text-base font-medium leading-snug text-foreground">{celebration.message}</p>
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
