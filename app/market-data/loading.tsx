import { SkeletonBlock, SkeletonStatRow } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 h-10 w-64 animate-pulse rounded-sm bg-surface-raised" />
      <SkeletonStatRow count={4} />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonBlock className="h-72 w-full" />
        <SkeletonBlock className="h-72 w-full" />
      </div>
    </div>
  );
}
