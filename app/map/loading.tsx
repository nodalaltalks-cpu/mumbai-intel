export default function MapPageLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="h-[57px] shrink-0 animate-pulse border-b border-border bg-surface" />
      <div className="flex flex-1 items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Loading map…</p>
        </div>
      </div>
    </div>
  );
}
