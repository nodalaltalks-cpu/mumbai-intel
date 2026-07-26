import { SkeletonBlock, SkeletonCardGrid } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 h-10 w-64 animate-pulse rounded-sm bg-surface-raised" />
      <SkeletonBlock className="h-40 w-full" />
      <div className="mt-8">
        <SkeletonCardGrid count={6} />
      </div>
    </div>
  );
}
