import LoadingSkeleton, {
  SkeletonSectionHeader,
  SkeletonSettingsSection,
} from "@/components/shared/LoadingSkeleton";

export default function SettingsLoading() {
  return (
    <LoadingSkeleton>
      <SkeletonSectionHeader />
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonSettingsSection key={i} />
      ))}
    </LoadingSkeleton>
  );
}
