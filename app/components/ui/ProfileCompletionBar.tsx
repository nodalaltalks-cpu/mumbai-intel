"use client";

import Button from "@/app/components/ui/Button";
import { useProfileCompletion } from "@/lib/profile-completion-client";
import { getSectionProgress } from "@/lib/profile-completion-shared";

/** Milestone framing — the nearest-below milestone's copy stays shown until the next is actually reached. */
function milestoneLabel(percent: number): string {
  if (percent >= 100) return "Research profile complete";
  if (percent >= 90) return "Just a little more to go";
  if (percent >= 75) return "Almost there";
  if (percent >= 50) return "Halfway there";
  if (percent >= 25) return "Off to a good start";
  return "Just getting started";
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
  const { sections, percent, scrollToFirstIncomplete } = useProfileCompletion();
  const sectionProgress = getSectionProgress(sections);
  const incomplete = sections.filter((s) => !s.complete);

  if (percent >= 100) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-positive">Research profile complete</p>
          <p className="mt-1 text-sm text-foreground">Your preferences are saved. NoDalalTalks can now make your research more relevant.</p>
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
          <span className="font-medium text-foreground">{milestoneLabel(percent)}.</span> Make your property research more relevant to you.
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
              <li key={s.key} className="text-xs text-foreground">
                • {s.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Section-wise breakdown — grouped from the exact same checklist above, so it can never disagree with the overall percent. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sectionProgress.map((sp) => (
          <div key={sp.section} className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-xs">
            <span className="text-muted">{sp.label}</span>
            <span className={sp.completeCount === sp.totalCount ? "font-medium text-positive" : "font-medium text-foreground"}>
              {sp.completeCount === sp.totalCount ? "Complete" : `${sp.completeCount} / ${sp.totalCount}`}
            </span>
          </div>
        ))}
      </div>

      <Button type="button" variant="primary" size="sm" className="self-start" onClick={scrollToFirstIncomplete}>
        Complete my profile
      </Button>
    </div>
  );
}
