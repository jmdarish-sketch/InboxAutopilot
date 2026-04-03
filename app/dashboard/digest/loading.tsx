import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonDigestCard,
} from "@/components/shared/LoadingSkeleton";

export default function DigestLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonDigestCard key={i} />
      ))}
    </LoadingSkeleton>
  );
}
