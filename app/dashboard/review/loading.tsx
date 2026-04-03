import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonBlock,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function ReviewLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      {/* Filter tabs skeleton */}
      <div className="flex gap-3 border-b border-gray-100 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-6 w-24" />
        ))}
      </div>
      <SkeletonCardList count={5} />
    </LoadingSkeleton>
  );
}
