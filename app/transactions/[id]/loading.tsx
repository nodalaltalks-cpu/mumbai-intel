import { SkeletonBlock, SkeletonStatRow } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <SkeletonBlock className="h-24 w-full" />
      <div className="mt-6">
        <SkeletonStatRow count={4} />
      </div>
    </div>
  );
}
