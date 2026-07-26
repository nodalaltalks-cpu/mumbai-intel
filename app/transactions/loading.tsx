import { SkeletonBlock, SkeletonStatRow } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-6 h-14 w-full animate-pulse rounded-sm bg-surface-raised" />
      <SkeletonStatRow count={7} />
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SkeletonBlock className="h-48 w-full" />
        <SkeletonBlock className="h-48 w-full" />
        <SkeletonBlock className="h-48 w-full" />
      </div>
      <div className="mt-6">
        <SkeletonBlock className="h-64 w-full" />
      </div>
    </div>
  );
}
