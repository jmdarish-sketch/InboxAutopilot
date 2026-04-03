import {
  SkeletonSectionHeader,
  SkeletonStatRow,
  SkeletonBlock,
  SkeletonTable,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function DiagnosisLoading() {
  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-12">
      <div className="mx-auto max-w-3xl space-y-10 px-4">
        <SkeletonSectionHeader />
        <SkeletonStatRow count={4} />
        {/* Category breakdown */}
        <div className="space-y-3">
          <SkeletonBlock className="h-5 w-36" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-3 flex-1" />
              <SkeletonBlock className="h-4 w-10" />
            </div>
          ))}
        </div>
        <SkeletonTable rows={5} cols={4} />
        <SkeletonCardList count={3} />
      </div>
    </div>
  );
}
