export default function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface px-6 py-8 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Loading map…</p>
      </div>
    </div>
  );
}
