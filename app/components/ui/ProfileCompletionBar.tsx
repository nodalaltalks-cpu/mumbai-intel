import Button from "@/app/components/ui/Button";
import type { CompletionSectionStatus } from "@/lib/profile-completion";

/** Where each incomplete checklist item scrolls to on tap — same-page fragment links, no JS needed. Keys mirror lib/profile-completion.ts's PROFILE_COMPLETION_SECTIONS. */
const SECTION_ANCHORS: Record<string, string> = {
  name: "#basic-profile",
  phone: "#basic-profile",
  emailVerified: "#basic-profile",
  budget: "#budget",
  localities: "#locations",
  category: "#property-type",
  configuration: "#property-type",
  readiness: "#property-type",
  purpose: "#purpose",
};

/** The five milestones (0/25/50/75/100) — the nearest-below milestone's copy stays shown until the next one is actually reached, so a user at e.g. 40% still sees "Basic profile" progress framing rather than jumping ahead. */
function milestoneLabel(percent: number): string {
  if (percent >= 100) return "Research profile complete";
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
 * Public-side profile completion display — the motivational header for the
 * whole "Research Profile" experience. Each incomplete item is a real
 * tappable chip that scrolls straight to the relevant section
 * (SECTION_ANCHORS). At 100% this becomes a one-time elegant success state
 * instead of repeating the same "complete your profile" pitch forever.
 */
export default function ProfileCompletionBar({ percent, sections }: { percent: number; sections: CompletionSectionStatus[] }) {
  const clamped = Math.max(0, Math.min(100, percent));

  if (clamped >= 100) {
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
          <span className="font-mono text-2xl font-bold text-accent">{clamped}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${clamped}%` }} />
        </div>
        <p className="text-[11px] text-muted">
          <span className="font-medium text-foreground">{milestoneLabel(clamped)}.</span> Make your property research more relevant to you.
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

      <ul className="flex flex-wrap gap-1.5">
        {sections.map((s) => {
          const href = SECTION_ANCHORS[s.key];
          const content = (
            <>
              <span aria-hidden="true">{s.complete ? "✓" : "○"}</span>
              {s.label}
            </>
          );
          return (
            <li key={s.key}>
              {!s.complete && href ? (
                <a
                  href={href}
                  className="flex min-h-[2rem] items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {content}
                </a>
              ) : (
                <span
                  className={`flex min-h-[2rem] items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[11px] ${
                    s.complete ? "text-foreground" : "text-muted"
                  }`}
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Button href="#basic-profile" variant="primary" size="sm" className="self-start">
        Complete my profile
      </Button>
    </div>
  );
}
