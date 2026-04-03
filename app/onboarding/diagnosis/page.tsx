import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import Link                  from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSenderAggregates } from "@/lib/diagnosis/aggregates";
import { computeInboxDiagnosis }  from "@/lib/diagnosis/compute";
import type {
  CategoryBreakdownItem,
  ClutterSender,
  ProtectedSender,
  InboxDiagnosis,
} from "@/lib/diagnosis/compute";

// ---------------------------------------------------------------------------
// Page data loader
// ---------------------------------------------------------------------------

async function getDiagnosis(): Promise<{ supabaseUserId: string; diagnosis: InboxDiagnosis }> {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, onboarding_status")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");
  if (user.onboarding_status === "not_started" || user.onboarding_status === "gmail_connected") {
    redirect("/onboarding/scan");
  }

  const supabaseUserId = user.id as string;

  // Recompute sender aggregates once — idempotent if re-run
  await updateSenderAggregates(supabaseUserId);

  const diagnosis = await computeInboxDiagnosis(supabaseUserId);
  return { supabaseUserId, diagnosis };
}

// ---------------------------------------------------------------------------
// Sub-components (all server-rendered, zero client JS)
// ---------------------------------------------------------------------------

function SummaryCard({
  value,
  label,
  suffix = "",
  accent,
}: {
  value: number;
  label: string;
  suffix?: string;
  accent: "blue" | "amber" | "green" | "purple";
}) {
  const colors = {
    blue:   "bg-blue-50 border-blue-100 text-blue-700",
    amber:  "bg-amber-50 border-amber-100 text-amber-700",
    green:  "bg-green-50 border-green-100 text-green-700",
    purple: "bg-purple-50 border-purple-100 text-purple-700",
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[accent]}`}>
      <p className="text-3xl font-bold tabular-nums">
        {value.toLocaleString()}{suffix}
      </p>
      <p className="mt-1 text-sm font-medium opacity-80">{label}</p>
    </div>
  );
}

function CategoryBreakdown({ items }: { items: CategoryBreakdownItem[] }) {
  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Category breakdown</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {items.map((item, idx) => (
          <div
            key={item.category}
            className={`flex items-center gap-4 px-5 py-3.5 ${
              idx < items.length - 1 ? "border-b border-gray-50" : ""
            }`}
          >
            {/* Label */}
            <span className="w-36 shrink-0 text-sm font-medium text-gray-700">
              {item.label}
            </span>

            {/* Bar */}
            <div className="flex flex-1 items-center gap-3">
              <div className="flex-1 overflow-hidden rounded-full bg-gray-100 h-2">
                <div
                  className={`h-full rounded-full transition-all ${item.color}`}
                  style={{ width: `${Math.max(2, (item.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>

            {/* Count + pct */}
            <div className="flex w-28 shrink-0 items-center justify-end gap-2">
              <span className="text-sm font-semibold tabular-nums text-gray-900">
                {item.count.toLocaleString()}
              </span>
              <span className="w-10 text-right text-xs text-gray-400">
                {item.pct}%
              </span>
            </div>

            {/* Tooltip-like description — visible on hover via title */}
            <span className="sr-only">{item.description}</span>
          </div>
        ))}
      </div>
      {/* Description row below the bars */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {items.slice(0, 4).map(item => (
          <span key={item.category} className="text-xs text-gray-400">
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${item.color}`} />
            {item.label}: {item.description.toLowerCase()}
          </span>
        ))}
      </div>
    </section>
  );
}

function SenderInitial({ name, email }: { name: string | null; email: string }) {
  const letter = (name?.[0] ?? email[0]).toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
      {letter}
    </span>
  );
}

function ConfidencePip({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles = {
    High:   "bg-green-100 text-green-800",
    Medium: "bg-amber-100 text-amber-800",
    Low:    "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>
      {level}
    </span>
  );
}

function RepeatClutterTable({ senders }: { senders: ClutterSender[] }) {
  if (senders.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Repeat clutter senders</h2>
        <p className="text-sm text-gray-400">No high-clutter senders detected.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Repeat clutter senders</h2>
      <p className="mb-4 text-sm text-gray-400">
        These senders send frequently but receive little or no engagement.
      </p>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {/* Header */}
        <div className="hidden grid-cols-[1fr_80px_80px_140px_60px] gap-4 border-b border-gray-100 px-5 py-3 sm:grid">
          {["Sender", "Last 30d", "Opened", "Suggestion", "Conf."].map(h => (
            <span key={h} className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {h}
            </span>
          ))}
        </div>

        {senders.map((s, idx) => {
          const openRate = s.message_count > 0
            ? Math.round((s.open_count / s.message_count) * 100)
            : 0;

          return (
            <div
              key={s.id}
              className={`flex flex-col gap-2 px-5 py-4 sm:grid sm:grid-cols-[1fr_80px_80px_140px_60px] sm:items-center sm:gap-4 ${
                idx < senders.length - 1 ? "border-b border-gray-50" : ""
              }`}
            >
              {/* Sender */}
              <div className="flex items-center gap-3 min-w-0">
                <SenderInitial name={s.sender_name} email={s.sender_email} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {s.sender_name ?? s.sender_email}
                  </p>
                  <p className="truncate text-xs text-gray-400">{s.sender_email}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium sm:hidden ${s.badge_color}`}>
                    {s.badge}
                  </span>
                </div>
              </div>

              {/* Last 30d count */}
              <div className="flex items-center gap-2 sm:block">
                <span className="text-xs text-gray-400 sm:hidden">Last 30d:</span>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {s.recent_count > 0 ? s.recent_count : s.message_count}
                </span>
              </div>

              {/* Open rate */}
              <div className="flex items-center gap-2 sm:block">
                <span className="text-xs text-gray-400 sm:hidden">Opened:</span>
                <span className={`text-sm font-medium tabular-nums ${openRate === 0 ? "text-red-500" : "text-gray-700"}`}>
                  {openRate}%
                </span>
              </div>

              {/* Suggested action */}
              <div className="flex items-center gap-2">
                <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${s.badge_color}`}>
                  {s.badge}
                </span>
                <span className="text-xs text-gray-500">{s.suggested_action}</span>
              </div>

              {/* Confidence */}
              <div>
                <ConfidencePip level={s.confidence_label} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProtectedSendersList({ senders }: { senders: ProtectedSender[] }) {
  if (senders.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Protected senders</h2>
      <p className="mb-4 text-sm text-gray-400">
        These senders are marked safe — we will never auto-archive their emails.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {senders.map(s => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4"
          >
            <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
              {s.reason_icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">
                {s.sender_name ?? s.sender_email}
              </p>
              <p className="truncate text-xs text-gray-400">{s.sender_email}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{s.protection_reason}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
              Protected
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DiagnosisPage() {
  const { diagnosis: d } = await getDiagnosis();
  const { summary: s }   = d;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-12">
      <div className="mx-auto max-w-3xl space-y-10 px-4">

        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Your inbox diagnosis</h1>
          <p className="mt-2 text-base text-gray-500">
            {s.total_messages > 0
              ? `Here's what we found across ${s.total_messages.toLocaleString()} emails.`
              : "Here's what we found."}
          </p>
        </header>

        {/* Summary cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            value={s.archive_candidates}
            label="Emails to archive"
            accent="amber"
          />
          <SummaryCard
            value={s.suggested_unsubscribes}
            label="Suggested unsubscribes"
            accent="purple"
          />
          <SummaryCard
            value={s.important_protected}
            label="Senders protected"
            accent="green"
          />
          <SummaryCard
            value={s.estimated_reduction_pct}
            label="Estimated reduction"
            suffix="%"
            accent="blue"
          />
        </section>

        {/* Category breakdown */}
        {d.category_breakdown.length > 0 && (
          <CategoryBreakdown items={d.category_breakdown} />
        )}

        {/* Repeat clutter table */}
        <RepeatClutterTable senders={d.top_clutter_senders} />

        {/* Protected senders */}
        <ProtectedSendersList senders={d.protected_senders} />

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <Link
            href="/onboarding/cleanup"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:w-auto sm:min-w-64"
          >
            Review cleanup plan
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <p className="text-xs text-gray-400">
            You review every action before anything is applied.
          </p>
        </div>

      </div>
    </div>
  );
}
