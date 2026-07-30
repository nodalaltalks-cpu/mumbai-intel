/** Public-side profile completion display — same visual language as the admin ProgressIndicator (accent fill, rounded track) but sized for a standalone motivational card rather than an inline toolbar. */
export default function ProfileCompletionBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Profile completion</span>
        <span className="font-mono text-sm font-semibold text-accent">{clamped}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
      </div>
      {clamped < 100 ? (
        <p className="text-[11px] text-muted">Complete your profile to unlock a more personalized experience.</p>
      ) : (
        <p className="text-[11px] text-positive">Your profile is complete.</p>
      )}
    </div>
  );
}
