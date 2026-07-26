export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-raised ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface">
      <SkeletonBlock className="h-36 w-full rounded-none" />
      <div className="flex flex-col gap-3 p-4">
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-3 w-1/2" />
        <div className="mt-2 flex items-end justify-between border-t border-border pt-3">
          <SkeletonBlock className="h-4 w-16" />
          <SkeletonBlock className="h-4 w-10" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
      <SkeletonBlock className="h-3 w-1/3" />
      <SkeletonBlock className="h-6 w-2/3" />
    </div>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}
