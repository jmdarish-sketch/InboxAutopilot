import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonCardList,
} from "@/components/shared/LoadingSkeleton";

export default function ImportantLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      <SkeletonCardList count={6} />
    </LoadingSkeleton>
  );
}
