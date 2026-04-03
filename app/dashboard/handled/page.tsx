import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { Suspense }          from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchHandledActions } from "@/lib/dashboard/handledQueries";
import type { HandledFilterTab } from "@/lib/dashboard/handledQueries";
import HandledActionsTable from "@/components/dashboard/HandledActionsTable";

export const dynamic = "force-dynamic";

const VALID_TABS = new Set<HandledFilterTab>([
  "today", "7days", "30days", "archive", "unsubscribe", "muted",
]);

function isValidTab(v: string | undefined): v is HandledFilterTab {
  return !!v && VALID_TABS.has(v as HandledFilterTab);
}

export default async function HandledPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ userId }, clerkUser, params] = await Promise.all([
    auth(),
    currentUser(),
    searchParams,
  ]);

  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) redirect("/sign-in");

  const activeTab: HandledFilterTab = isValidTab(params.tab) ? params.tab : "today";

  const [items, totalCount] = await Promise.all([
    fetchHandledActions(user.id as string, activeTab, 200),
    // Total across all time for the header stat
    fetchHandledActions(user.id as string, "all", 1).then(() =>
      supabase
        .from("actions_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id as string)
        .eq("status", "succeeded")
        .then(r => r.count ?? 0)
    ),
  ]);

  const undoableCount = items.filter(i => i.reversible && !i.undone).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Handled</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything autopilot has acted on. Every action is reversible by default.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total actions</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Showing</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Undoable</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{undoableCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Undone</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {items.filter(i => i.undone).length}
          </p>
        </div>
      </div>

      {/* Table */}
      <Suspense>
        <HandledActionsTable items={items} activeTab={activeTab} />
      </Suspense>
    </div>
  );
}
