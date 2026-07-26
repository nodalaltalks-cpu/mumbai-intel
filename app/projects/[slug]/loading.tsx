import { SkeletonBlock, SkeletonStatRow } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonBlock className="h-[42vh] min-h-[320px] w-full rounded-none" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6">
        <SkeletonStatRow count={8} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
