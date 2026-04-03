import { auth, currentUser }    from "@clerk/nextjs/server";
import { redirect }              from "next/navigation";
import { Suspense }              from "react";
import { createAdminClient }     from "@/lib/supabase/admin";
import { fetchReviewItems }      from "@/lib/review/queries";
import type { ReviewFilter }     from "@/lib/review/queries";
import FilterTabs                from "@/components/shared/FilterTabs";
import ReviewList                from "./ReviewList";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { label: "All",               value: "all"               },
  { label: "New senders",       value: "new_senders"       },
  { label: "Borderline promo",  value: "borderline_promo"  },
  { label: "Possible important",value: "possible_important" },
  { label: "Expiring soon",     value: "expiring_soon"     },
] as const;

const VALID_FILTERS = new Set<ReviewFilter>(TABS.map(t => t.value as ReviewFilter));

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------

async function getData(filter: ReviewFilter) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  return fetchReviewItems(user.id as string, filter, 50);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface ReviewPageProps {
  searchParams: Promise<Record<string, string>>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const rawFilter = params.filter ?? "all";
  const filter: ReviewFilter = VALID_FILTERS.has(rawFilter as ReviewFilter)
    ? (rawFilter as ReviewFilter)
    : "all";

  const items = await getData(filter);

  return (
    <div className="min-h-full pb-16 pt-10">
      <div className="mx-auto max-w-3xl space-y-6 px-6">

        {/* Header */}
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Review queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            These emails need a decision before autopilot acts.
          </p>
        </header>

        {/* Filter tabs */}
        <Suspense>
          <FilterTabs
            tabs={TABS.map(t => ({ label: t.label, value: t.value }))}
          />
        </Suspense>

        {/* Item count */}
        {items.length > 0 && (
          <p className="text-xs font-medium text-gray-400">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {filter !== "all" && " in this filter"}
          </p>
        )}

        {/* List — client component handles interactivity */}
        <ReviewList initialItems={items} />
      </div>
    </div>
  );
}
