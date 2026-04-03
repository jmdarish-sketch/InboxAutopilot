import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonStatRow,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/shared/LoadingSkeleton";

export default function RecoveryLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      <SkeletonStatRow count={4} />
      <SkeletonBlock className="h-10 w-full !rounded-xl" />
      <div className="flex gap-3 border-b border-gray-100 pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-6 w-24" />
        ))}
      </div>
      <SkeletonTable rows={6} cols={6} />
    </LoadingSkeleton>
  );
}
