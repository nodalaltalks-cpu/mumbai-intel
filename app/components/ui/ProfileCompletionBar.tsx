import type { CompletionSectionStatus } from "@/lib/profile-completion";

/** Public-side profile completion display — same visual language as the admin ProgressIndicator (accent fill, rounded track) but sized for a standalone motivational card rather than an inline toolbar. Shows the section checklist (Section 32's "✓ Name / ○ Budget / ...") so completion feels like guided progress, not a bare number. */
export default function ProfileCompletionBar({ percent, sections }: { percent: number; sections: CompletionSectionStatus[] }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Research profile</span>
          <span className="font-mono text-sm font-semibold text-accent">{clamped}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
        </div>
        {clamped < 100 ? (
          <p className="text-[11px] text-muted">Complete your research profile to get more relevant project recommendations and market insights.</p>
        ) : (
          <p className="text-[11px] text-positive">Your research profile is complete.</p>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sections.map((s) => (
          <li key={s.key} className={`flex items-center gap-1.5 text-[11px] ${s.complete ? "text-foreground" : "text-muted"}`}>
            <span aria-hidden="true">{s.complete ? "✓" : "○"}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
