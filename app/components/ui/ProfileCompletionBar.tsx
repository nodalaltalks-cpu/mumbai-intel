"use client";

import Button from "@/app/components/ui/Button";
import { useProfileCompletion } from "@/lib/profile-completion-client";
import { getSectionProgress } from "@/lib/profile-completion-shared";

/** Milestone framing — the nearest-below milestone's copy stays shown until the next is actually reached. Brackets and wording match the product's own 20/40/60/80/90/100 milestones (ProfileMilestoneToast fires the celebration at the same thresholds). */
function milestoneLabel(percent: number): string {
  if (percent >= 100) return "Your research profile is complete";
  if (percent >= 90) return "Just a little more";
  if (percent >= 80) return "Almost there";
  if (percent >= 60) return "Now we're getting a much clearer picture of what you're looking for";
  if (percent >= 40) return "Your research profile is taking shape";
  if (percent >= 20) return "You're getting started";
  return "Just getting started";
}

/**
 * Smart motivation (reflects the user's ACTUAL remaining sections, never a
 * repeated generic line) — named-field copy for the two highest-value gaps
 * this product actually recommends against (budget, locality), a "one last
 * detail" framing when literally one field remains, otherwise the milestone
 * copy above. No fabricated personalization signal (visit count, skip
 * history) is invented here -- only what the current section list already
 * tells us for certain.
 */
function smartMotivationMessage(percent: number, incomplete: { key: string; label: string }[]): string {
  if (percent >= 100) return milestoneLabel(percent);
  if (incomplete.length === 1) {
    return `One last detail — add your ${incomplete[0].label.toLowerCase()} to finish up.`;
  }
  const missingBudget = incomplete.find((s) => s.key === "budget");
  if (missingBudget && incomplete.length <= 3) {
    return "Your research profile is almost ready. Add your budget to make project recommendations more relevant.";
  }
  const missingLocality = incomplete.find((s) => s.key === "localities");
  if (missingLocality && incomplete.length <= 3) {
    return "Tell us where you're looking and we'll make your research more relevant.";
  }
  return milestoneLabel(percent);
}

/** Real, verified benefits only — every line below corresponds to something this platform actually does today (no promised feature that doesn't exist yet). */
const BENEFITS = [
  "Keeps your saved searches and alerts ready to activate the moment they turn on",
  "Shows exactly what NoDalalTalks knows about what you're looking for, in one place",
  "Helps us prioritise the localities and project types you care about most",
];

/**
 * Public-side profile completion display — reads live state from
 * ProfileCompletionProvider (lib/profile-completion-client.tsx), not static
 * props, so the percent/bar/checklist/section breakdown all update the
 * instant a field is toggled, no page refresh or server round trip needed.
 * At 100% this becomes a one-time elegant success state.
 */
export default function ProfileCompletionBar() {
  const { sections, percent, scrollToFirstIncomplete, scrollToSection, scrollToField } = useProfileCompletion();
  const sectionProgress = getSectionProgress(sections);
  const incomplete = sections.filter((s) => !s.complete);
  const singleRemaining = incomplete.length === 1 ? incomplete[0] : null;

  if (percent >= 100) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div>
          {/* Deliberately says "Research Profile Complete", never "Verified" -- Section 14: must never imply identity/KYC/phone verification that hasn't actually happened. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-positive">
            <span aria-hidden="true">✓</span> Research Profile Complete
          </span>
          <p className="mt-2 text-sm text-foreground">Your preferences are saved. NoDalalTalks can now make your research more relevant.</p>
        </div>
        <Button href="/projects" variant="secondary" size="sm">
          Continue research
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wide text-muted">Your Research Profile</span>
          <span className="font-mono text-2xl font-bold text-accent">{percent}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[11px] text-muted">
          <span className="font-medium text-foreground">{smartMotivationMessage(percent, incomplete)}</span>
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2 text-xs text-muted">
            <span aria-hidden="true" className="mt-0.5 text-positive">
              ✓
            </span>
            {b}
          </li>
        ))}
      </ul>

      {incomplete.length > 0 ? (
        <div className="rounded-sm border border-border bg-background p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">What&apos;s left</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {incomplete.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => scrollToField(s.key, "whats_left_row")}
                  className="w-full rounded-sm px-1 py-0.5 text-left text-xs text-foreground transition-colors hover:bg-surface-raised hover:text-accent"
                >
                  • {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Section-wise breakdown — grouped from the exact same checklist above, so it can never disagree with the overall percent. Every row jumps straight to that section's first incomplete field (Part 2). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sectionProgress.map((sp) => {
          const isComplete = sp.completeCount === sp.totalCount;
          return (
            <button
              key={sp.section}
              type="button"
              onClick={() => scrollToSection(sp.section, "section_grid")}
              className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-xs transition-colors hover:border-accent/50 hover:bg-surface-raised"
            >
              <span className="text-muted">{sp.label}</span>
              <span className={isComplete ? "font-medium text-positive" : "font-medium text-foreground"}>
                {isComplete ? "Complete" : `${sp.completeCount} / ${sp.totalCount}`}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="primary"
        size="sm"
        className="self-start"
        onClick={() => (singleRemaining ? scrollToField(singleRemaining.key, "completion_bar_cta") : scrollToFirstIncomplete("completion_bar"))}
      >
        {singleRemaining ? `Complete ${singleRemaining.label}` : "Complete my profile"}
      </Button>
    </div>
  );
}
