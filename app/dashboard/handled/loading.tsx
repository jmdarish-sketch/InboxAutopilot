import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonStatRow,
  SkeletonBlock,
  SkeletonTable,
} from "@/components/shared/LoadingSkeleton";

export default function HandledLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      <SkeletonStatRow count={4} />
      <div className="flex gap-3 border-b border-gray-100 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-6 w-20" />
        ))}
      </div>
      <SkeletonTable rows={6} cols={7} />
    </LoadingSkeleton>
  );
}
