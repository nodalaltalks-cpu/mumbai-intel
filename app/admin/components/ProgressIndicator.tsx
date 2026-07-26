export default function ProgressIndicator({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
      </div>
      <span className="font-mono text-[10px] text-muted">{clamped}% complete</span>
    </div>
  );
}
