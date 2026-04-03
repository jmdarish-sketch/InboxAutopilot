import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import Link                  from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchDashboardSummary } from "@/lib/dashboard/queries";
import type { ImportantInboxItem } from "@/lib/dashboard/queries";
import { fetchHandledActions }   from "@/lib/dashboard/handledQueries";
import ReviewQueuePreview    from "@/components/dashboard/ReviewQueuePreview";
import RecentActionsFeed     from "@/components/dashboard/RecentActionsFeed";
import SyncNowButton         from "@/components/dashboard/SyncNowButton";

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------

async function getDashboardData() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, autopilot_mode")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  const [summary, recentActions] = await Promise.all([
    fetchDashboardSummary(user.id as string),
    fetchHandledActions(user.id as string, "all", 10),
  ]);

  return { ...summary, recentActions };
}

// ---------------------------------------------------------------------------
// Sub-components (server-rendered)
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, string> = {
  suggest_only: "Suggest Only",
  safe:         "Safe Autopilot",
  aggressive:   "Aggressive Autopilot",
};

function StatCard({
  label,
  value,
  delta,
  accent,
  tooltip,
}: {
  label:   string;
  value:   number;
  delta?:  number;
  accent:  "blue" | "amber" | "red" | "green";
  tooltip?: string;
}) {
  const colors = {
    blue:  "bg-blue-50 border-blue-100",
    amber: "bg-amber-50 border-amber-100",
    red:   "bg-red-50 border-red-100",
    green: "bg-green-50 border-green-100",
  };
  const valueColors = {
    blue:  "text-blue-700",
    amber: "text-amber-700",
    red:   "text-red-700",
    green: "text-green-700",
  };

  return (
    <div className={`rounded-2xl border p-5 ${colors[accent]}`} title={tooltip}>
      <p className={`text-3xl font-bold tabular-nums ${valueColors[accent]}`}>
        {value.toLocaleString()}
      </p>
      <p className={`mt-1 text-sm font-medium ${valueColors[accent]} opacity-80`}>{label}</p>
      {delta !== undefined && delta !== 0 && (
        <p className={`mt-1 text-xs font-medium ${delta > 0 ? "text-green-600" : "text-gray-400"}`}>
          {delta > 0 ? `+${delta}` : delta} vs yesterday
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Important inbox (purely server-rendered, no interactions needed)
// ---------------------------------------------------------------------------

const CATEGORY_REASONS: Record<string, string> = {
  critical_transactional: "Contains transactional or security language",
  personal_human:         "Looks like a genuine personal email",
  work_school:            "Detected work or school sender",
  recurring_useful:       "You regularly engage with this sender",
};

function ImportantCard({ item }: { item: ImportantInboxItem }) {
  const reason = item.actionReason
    ? item.actionReason.replace(/_/g, " ")
    : CATEGORY_REASONS[item.finalCategory ?? ""] ?? "Marked as important";

  const gmailUrl = item.gmailThreadId
    ? `https://mail.google.com/mail/#inbox/${item.gmailThreadId}`
    : "https://mail.google.com";

  const initial = (
    item.senderName?.[0] ?? item.senderEmail?.[0] ?? "?"
  ).toUpperCase();

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5">
      {/* Avatar */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
        {initial}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.senderName ?? item.senderEmail ?? "Unknown sender"}
        </p>
        <p className="mt-0.5 truncate text-sm text-gray-700">
          {item.subject ?? "(no subject)"}
        </p>
        {item.snippet && (
          <p className="mt-1 line-clamp-1 text-xs text-gray-400">{item.snippet}</p>
        )}
        <p className="mt-1.5 text-xs font-medium text-blue-600">{reason}</p>
      </div>

      {/* Open in Gmail */}
      <a
        href={gmailUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        Open
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const { stats, reviewPreview, importantInbox, recentActions } =
    await getDashboardData();

  return (
    <div className="min-h-full pb-16 pt-10">
      <div className="mx-auto max-w-4xl space-y-10 px-6">

        {/* Page header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
            <p className="mt-1 text-sm text-gray-500">
              Here&apos;s what your autopilot handled today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SyncNowButton />
            <span className="hidden rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline-block">
              Autopilot active
            </span>
          </div>
        </header>

        {/* Stat cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Handled today"
            value={stats.handledToday}
            delta={stats.handledDelta}
            accent="blue"
            tooltip="Total actions taken by autopilot today"
          />
          <StatCard
            label="Archived automatically"
            value={stats.archivedToday}
            delta={stats.archivedDelta}
            accent="amber"
            tooltip="Emails archived today without your involvement"
          />
          <StatCard
            label="Needs review"
            value={stats.needsReview}
            accent="red"
            tooltip="Emails autopilot is unsure about — needs your decision"
          />
          <StatCard
            label="Important surfaced"
            value={stats.importantSurfaced}
            accent="green"
            tooltip="Emails classified as important in your inbox"
          />
        </section>

        {/* Review queue preview */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Review queue</h2>
              <p className="mt-0.5 text-sm text-gray-400">
                Emails that need a decision before autopilot acts.
              </p>
            </div>
            {stats.needsReview > 5 && (
              <Link
                href="/dashboard/review"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {stats.needsReview} items →
              </Link>
            )}
          </div>
          <ReviewQueuePreview items={reviewPreview} />
        </section>

        {/* Important inbox */}
        {importantInbox.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Important</h2>
                <p className="mt-0.5 text-sm text-gray-400">
                  Messages your autopilot thinks matter most.
                </p>
              </div>
              <Link
                href="/dashboard/important"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {importantInbox.map(item => (
                <ImportantCard key={item.messageId} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Recent actions feed */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent actions</h2>
              <p className="mt-0.5 text-sm text-gray-400">
                Everything autopilot did — undo any action instantly.
              </p>
            </div>
            <Link
              href="/dashboard/handled"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View all →
            </Link>
          </div>
          <RecentActionsFeed actions={recentActions} />
        </section>

      </div>
    </div>
  );
}
