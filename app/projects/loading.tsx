import { SkeletonCardGrid } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <div className="mb-4 h-6 w-32 animate-pulse rounded-sm bg-surface-raised" />
      <SkeletonCardGrid count={9} />
    </div>
  );
}
