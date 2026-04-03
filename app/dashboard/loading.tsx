import LoadingSkeleton, {
  SkeletonStatRow,
  SkeletonSectionHeader,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function DashboardLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      <SkeletonStatRow count={4} />
      <div className="space-y-4">
        <SkeletonSectionHeader />
        <SkeletonCardList count={3} />
      </div>
      <div className="space-y-4">
        <SkeletonSectionHeader />
        <SkeletonCardList count={3} />
      </div>
      <div className="space-y-4">
        <SkeletonSectionHeader />
        <SkeletonCardList count={3} />
      </div>
    </LoadingSkeleton>
  );
}
