import { SkeletonBlock } from "@/app/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-6 w-56" />
        <SkeletonBlock className="h-4 w-72" />
      </div>
      <SkeletonBlock className="h-48 w-full" />
    </div>
  );
}
