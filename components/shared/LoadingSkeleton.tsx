// ---------------------------------------------------------------------------
// LoadingSkeleton — reusable skeleton primitives for loading states.
// Compose these into page-specific loading layouts.
// ---------------------------------------------------------------------------

function pulse() {
  return "animate-pulse rounded bg-gray-200";
}

/** A single rectangular skeleton block. */
export function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return <div className={`${pulse()} ${className}`} />;
}

/** Skeleton stat card matching the dashboard StatCard layout. */
export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <SkeletonBlock className="h-8 w-16" />
      <SkeletonBlock className="mt-2 h-4 w-28" />
      <SkeletonBlock className="mt-2 h-3 w-20" />
    </div>
  );
}

/** Row of 4 stat card skeletons. */
export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a table row. */
export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonBlock className={`h-4 ${i === 0 ? "w-16" : i === 1 ? "w-32" : "w-20"}`} />
        </td>
      ))}
    </tr>
  );
}

/** Skeleton for a full table with header and rows. */
export function SkeletonTable({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <SkeletonBlock className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Skeleton for a list card (review queue, important items, actions feed). */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-10 w-10 !rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-64" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
        <SkeletonBlock className="h-8 w-16 !rounded-lg" />
      </div>
    </div>
  );
}

/** Skeleton for a list of cards. */
export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton for section header. */
export function SkeletonSectionHeader() {
  return (
    <div className="space-y-1">
      <SkeletonBlock className="h-6 w-32" />
      <SkeletonBlock className="h-4 w-56" />
    </div>
  );
}

/** Skeleton for the settings form sections. */
export function SkeletonSettingsSection() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="border-b border-gray-50 px-5 py-4">
        <SkeletonBlock className="h-4 w-32" />
      </div>
      <div className="px-5 py-4 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="space-y-1">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-3 w-48" />
            </div>
            <SkeletonBlock className="h-5 w-9 !rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for digest card sections. */
export function SkeletonDigestCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="border-b border-gray-50 px-5 py-3.5 flex items-center justify-between">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-5 w-8 !rounded-full" />
      </div>
      <div className="px-5 py-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full page loading skeleton wrapper. */
export default function LoadingSkeleton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full pb-16 pt-10">
      <div className="mx-auto max-w-4xl space-y-10 px-6">
        {children}
      </div>
    </div>
  );
}
