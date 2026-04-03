import LoadingSkeleton, {
  SkeletonBlock,
  SkeletonStatCard,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function SenderDetailLoading() {
  return (
    <LoadingSkeleton>
      {/* Back link + header */}
      <SkeletonBlock className="h-4 w-16" />
      <div className="flex items-center gap-4">
        <SkeletonBlock className="h-12 w-12 !rounded-full" />
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Current rule */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-4 w-48" />
      </div>
      {/* Recent messages */}
      <SkeletonCardList count={5} />
    </LoadingSkeleton>
  );
}
