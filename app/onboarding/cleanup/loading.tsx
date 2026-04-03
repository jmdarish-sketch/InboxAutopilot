import {
  SkeletonSectionHeader,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function CleanupLoading() {
  return (
    <div className="min-h-screen bg-gray-50 pb-32 pt-12">
      <div className="mx-auto max-w-3xl space-y-10 px-4">
        <SkeletonSectionHeader />
        <div className="space-y-3">
          <SkeletonSectionHeader />
          <SkeletonCardList count={4} />
        </div>
        <div className="space-y-3">
          <SkeletonSectionHeader />
          <SkeletonCardList count={2} />
        </div>
        <div className="space-y-3">
          <SkeletonSectionHeader />
          <SkeletonCardList count={3} />
        </div>
      </div>
    </div>
  );
}
