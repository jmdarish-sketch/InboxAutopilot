import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/shared/LoadingSkeleton";

export default function SendersLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      {/* Search + filters skeleton */}
      <div className="flex gap-3">
        <SkeletonBlock className="h-10 flex-1 !rounded-xl" />
        <SkeletonBlock className="h-10 w-32 !rounded-xl" />
        <SkeletonBlock className="h-10 w-32 !rounded-xl" />
      </div>
      <SkeletonTable rows={8} cols={6} />
    </LoadingSkeleton>
  );
}
