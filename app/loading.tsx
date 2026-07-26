import { SkeletonCardGrid, SkeletonStatRow } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-10 h-14 w-full animate-pulse rounded-sm bg-surface-raised" />
      <SkeletonStatRow count={6} />
      <div className="mt-10">
        <SkeletonCardGrid count={6} />
      </div>
    </div>
  );
}
