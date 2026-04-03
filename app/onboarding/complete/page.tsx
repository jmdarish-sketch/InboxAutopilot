import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import Link                  from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Stats loader
// ---------------------------------------------------------------------------

interface CompletionStats {
  emailsArchived:    number;
  sendersActedOn:    number;
  importantProtected: number;
  modeName:          string;
}

const MODE_LABELS: Record<string, string> = {
  suggest_only: "Suggest Only",
  safe:         "Safe Autopilot",
  aggressive:   "Aggressive Autopilot",
};

async function getCompletionStats(): Promise<CompletionStats> {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id, onboarding_status, autopilot_mode")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  const status = user.onboarding_status;

  // Gate: must have set autopilot
  if (status === "not_started" || status === "gmail_connected") {
    redirect("/onboarding/scan");
  }
  if (status === "initial_scan_complete") {
    redirect("/onboarding/diagnosis");
  }
  if (status === "cleanup_reviewed") {
    redirect("/onboarding/autopilot");
  }

  const supabaseUserId = user.id as string;

  // Parallel stat queries
  const [archivedResult, actedOnResult, protectedResult] = await Promise.all([
    // Count messages marked handled during initial cleanup
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("review_status", "handled"),

    // Count distinct senders acted on (archive or unsubscribe) during initial cleanup
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("action_source", "initial_cleanup")
      .eq("status", "succeeded"),

    // Count senders with high importance scores (protected)
    supabase
      .from("senders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .gte("importance_score", 65),
  ]);

  return {
    emailsArchived:     archivedResult.count ?? 0,
    sendersActedOn:     actedOnResult.count  ?? 0,
    importantProtected: protectedResult.count ?? 0,
    modeName:           MODE_LABELS[user.autopilot_mode] ?? "Safe Autopilot",
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "amber" | "purple" | "green";
}) {
  const styles = {
    amber:  "border-amber-100 bg-amber-50 text-amber-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
    green:  "border-green-100 bg-green-50 text-green-700",
  };
  return (
    <div className={`rounded-2xl border px-5 py-4 ${styles[accent]}`}>
      <p className="text-3xl font-bold tabular-nums">
        {value > 0 ? value.toLocaleString() : "—"}
      </p>
      <p className="mt-1 text-sm font-medium opacity-80">{label}</p>
    </div>
  );
}

function NextStep({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-base leading-none" aria-hidden="true">{icon}</span>
      <span className="text-sm text-gray-600">{text}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CompletePage() {
  const stats = await getCompletionStats();

  const hasAnyAction =
    stats.emailsArchived > 0 || stats.sendersActedOn > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
      <div className="mx-auto w-full max-w-xl">

        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {hasAnyAction ? "Your inbox is cleaner." : "You're all set."}
          </h1>
          <p className="mt-2 text-base text-gray-500">
            {stats.modeName} is now active and monitoring your inbox.
          </p>
        </div>

        {/* Stats */}
        {hasAnyAction && (
          <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatChip
              value={stats.emailsArchived}
              label="Emails archived"
              accent="amber"
            />
            <StatChip
              value={stats.sendersActedOn}
              label="Senders cleaned up"
              accent="purple"
            />
            <StatChip
              value={stats.importantProtected}
              label="Senders protected"
              accent="green"
            />
          </div>
        )}

        {/* What happens next */}
        <div className="mb-10 rounded-2xl border border-gray-100 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
            What happens next
          </h2>
          <ul className="space-y-3.5">
            <NextStep
              icon="⚡"
              text="New clutter arriving in your inbox will be handled automatically based on your autopilot level."
            />
            <NextStep
              icon="📋"
              text="Emails the system is unsure about go to your review queue so nothing important gets missed."
            />
            <NextStep
              icon="↩️"
              text="You can undo any action from the Recovery page — nothing is permanently deleted."
            />
          </ul>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Go to Dashboard
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>

      </div>
    </div>
  );
}
