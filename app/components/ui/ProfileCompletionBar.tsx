import type { CompletionSectionStatus } from "@/lib/profile-completion";

/** Where each incomplete checklist item scrolls to on tap — same-page fragment links, no JS needed. Keys mirror lib/profile-completion.ts's PROFILE_COMPLETION_SECTIONS. */
const SECTION_ANCHORS: Record<string, string> = {
  name: "#basic-profile",
  phone: "#basic-profile",
  emailVerified: "#basic-profile",
  budget: "#budget",
  localities: "#locations",
  category: "#property-type",
  purpose: "#purpose",
};

/** The four milestones from the product spec (25/50/75/100) — the nearest-below milestone's copy stays shown until the next one is actually reached, so a user at e.g. 40% still sees "Basic profile" progress framing rather than jumping ahead. */
function milestoneLabel(percent: number): string {
  if (percent >= 100) return "Research profile complete";
  if (percent >= 75) return "Location + budget";
  if (percent >= 50) return "Search preferences";
  if (percent >= 25) return "Basic profile";
  return "Just getting started";
}

/**
 * Public-side profile completion display — the motivational header for the
 * whole "Research Profile" experience (Section 32/12 of the spec). Each
 * incomplete item is a real tappable chip that scrolls straight to the
 * relevant section (SECTION_ANCHORS), rather than a passive checklist —
 * "tapping an incomplete item should directly open that section."
 */
export default function ProfileCompletionBar({ percent, sections }: { percent: number; sections: CompletionSectionStatus[] }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wide text-muted">Research Profile</span>
          <span className="font-mono text-xl font-bold text-accent">{clamped}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
        </div>
        {clamped < 100 ? (
          <p className="text-[11px] text-muted">
            <span className="font-medium text-foreground">{milestoneLabel(clamped)}.</span> Complete your research profile to get more relevant
            project recommendations and market insights.
          </p>
        ) : (
          <p className="text-[11px] text-positive">Your research profile is complete. You&apos;re ready for more relevant property intelligence.</p>
        )}
      </div>
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
    </div>
  );
}
