import { SkeletonBlock } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-full bg-surface-raised" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-surface-raised" />
          <div className="h-3 w-56 animate-pulse rounded-sm bg-surface-raised" />
        </div>
      </div>
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-56 w-full" />
    </div>
  );
}
