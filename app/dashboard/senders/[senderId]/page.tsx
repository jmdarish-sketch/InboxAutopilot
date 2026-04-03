import { auth, currentUser }   from "@clerk/nextjs/server";
import { redirect, notFound }  from "next/navigation";
import Link                    from "next/link";
import { createAdminClient }   from "@/lib/supabase/admin";
import { fetchSenderDetail }   from "@/lib/senders/queries";
import SenderControlPanel      from "@/components/dashboard/SenderControlPanel";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

function buildReasons(sender: Awaited<ReturnType<typeof fetchSenderDetail>>): string[] {
  if (!sender) return [];
  const reasons: string[] = [];
  const mc = sender.messageCount;

  if (sender.archiveRate >= 70 && mc >= 5) {
    reasons.push(`You archived ${sender.archiveRate}% of emails from this sender.`);
  }
  if (sender.openRate <= 10 && mc >= 5) {
    reasons.push(`You opened only ${sender.openRate}% of emails — very low engagement.`);
  }
  if (sender.openRate >= 70) {
    reasons.push(`You open ${sender.openRate}% of emails from this sender — high engagement.`);
  }
  if (sender.replyCount >= 3) {
    reasons.push(`You have replied ${sender.replyCount} time${sender.replyCount !== 1 ? "s" : ""} to this sender.`);
  }
  if (sender.restoreCount > 0) {
    reasons.push(`You restored ${sender.restoreCount} email${sender.restoreCount !== 1 ? "s" : ""} from this sender from archive.`);
  }
  if (sender.unsubscribeCount > 0) {
    reasons.push(`You have unsubscribed from this sender ${sender.unsubscribeCount} time${sender.unsubscribeCount !== 1 ? "s" : ""}.`);
  }
  if (mc >= 10) {
    reasons.push(`This sender has sent ${mc} emails total.`);
  }
  if (sender.learnedState === "always_keep") {
    reasons.push("You set this sender to always keep.");
  }
  if (sender.learnedState === "always_archive") {
    reasons.push("You set this sender to always archive.");
  }
  if (reasons.length === 0) {
    reasons.push("Not enough data yet to draw strong conclusions. Keep interacting with emails from this sender.");
  }

  return reasons;
}

const RULE_DISPLAY: Record<string, { label: string; color: string }> = {
  always_keep:    { label: "Always keep",    color: "text-green-700 bg-green-50 ring-green-200" },
  always_archive: { label: "Always archive", color: "text-red-700 bg-red-50 ring-red-200" },
  digest_only:    { label: "Digest only",    color: "text-blue-700 bg-blue-50 ring-blue-200" },
  always_review:  { label: "Always review",  color: "text-yellow-700 bg-yellow-50 ring-yellow-200" },
};

const CATEGORY_COLORS: Record<string, string> = {
  promotion:           "bg-orange-50 text-orange-700 ring-orange-200",
  newsletter:          "bg-blue-50 text-blue-700 ring-blue-200",
  work_school:         "bg-purple-50 text-purple-700 ring-purple-200",
  transactional:       "bg-teal-50 text-teal-700 ring-teal-200",
  personal:            "bg-green-50 text-green-700 ring-green-200",
  recurring_useful:    "bg-indigo-50 text-indigo-700 ring-indigo-200",
  recurring_low_value: "bg-yellow-50 text-yellow-700 ring-yellow-200",
  spam_like:           "bg-red-50 text-red-700 ring-red-200",
  uncertain:           "bg-gray-50 text-gray-600 ring-gray-200",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  not_needed:          "—",
  queued:              "Queued",
  user_kept:           "Kept",
  user_archived:       "Archived",
  user_unsubscribed:   "Unsubscribed",
  expired:             "Expired",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SenderDetailPage({
  params,
}: {
  params: Promise<{ senderId: string }>;
}) {
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

  if (!user) redirect("/sign-in");

  const { senderId } = await params;
  const sender = await fetchSenderDetail(user.id as string, senderId);
  if (!sender) notFound();

  const reasons     = buildReasons(sender);
  const ruleDisplay = sender.activeRuleAction ? RULE_DISPLAY[sender.activeRuleAction] : null;
  const catColor    = CATEGORY_COLORS[sender.senderCategory ?? "uncertain"] ?? CATEGORY_COLORS.uncertain;

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <div>
        <Link
          href="/dashboard/senders"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          All senders
        </Link>
      </div>

      {/* Sender header */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            {sender.senderName ?? sender.senderDomain}
          </h1>
          {sender.senderCategory && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${catColor}`}>
              {sender.senderCategory.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">{sender.senderEmail}</p>
        <p className="text-xs text-gray-400">
          First seen {formatDate(sender.firstSeenAt)} · Last seen {formatDate(sender.lastSeenAt)}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Last 30 days"    value={sender.recentCount} sub="emails received" />
        <StatCard label="Open rate"       value={`${sender.openRate}%`} sub={`${sender.openCount} opens`} />
        <StatCard label="Archive rate"    value={`${sender.archiveRate}%`} sub={`${sender.archiveCount} archived`} />
        <StatCard label="Restore rate"    value={`${sender.restoreRate}%`} sub={`${sender.restoreCount} restored`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: rule + why + messages */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Current rule */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Current rule</h2>
            <div className="mt-3 flex items-center gap-3">
              {ruleDisplay ? (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${ruleDisplay.color}`}>
                  {ruleDisplay.label}
                </span>
              ) : (
                <span className="text-sm text-gray-500">No rule — autopilot decides based on behavior</span>
              )}
              {sender.activeRuleSource && (
                <span className="text-xs text-gray-400">
                  Source: {sender.activeRuleSource.replace(/_/g, " ")}
                </span>
              )}
            </div>
            {sender.activeRuleCreatedAt && (
              <p className="mt-2 text-xs text-gray-400">
                Set {formatDate(sender.activeRuleCreatedAt)}
              </p>
            )}
          </div>

          {/* Why the system thinks this */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Why the system thinks this</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Recent messages */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Recent messages</h2>
            {sender.recentMessages.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">No messages found.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-50">
                {sender.recentMessages.map(msg => (
                  <li key={msg.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex-1 truncate text-sm font-medium text-gray-900">
                        {msg.subject ?? "(no subject)"}
                      </p>
                      <span className="flex-shrink-0 text-xs text-gray-400">
                        {msg.receivedAt ? new Date(msg.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                      </span>
                    </div>
                    {msg.snippet && (
                      <p className="truncate text-xs text-gray-500">{msg.snippet}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {msg.finalCategory && (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ring-1 ring-inset ${CATEGORY_COLORS[msg.finalCategory] ?? CATEGORY_COLORS.uncertain}`}>
                          {msg.finalCategory.replace(/_/g, " ")}
                        </span>
                      )}
                      {msg.reviewStatus !== "not_needed" && (
                        <span className="text-xs text-gray-400">
                          {REVIEW_STATUS_LABELS[msg.reviewStatus] ?? msg.reviewStatus}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: control panel */}
        <div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Controls</h2>
            <SenderControlPanel sender={sender} />
          </div>
        </div>
      </div>
    </div>
  );
}
