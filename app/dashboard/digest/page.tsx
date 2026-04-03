import { auth, currentUser }  from "@clerk/nextjs/server";
import { redirect }            from "next/navigation";
import Link                    from "next/link";
import { createAdminClient }   from "@/lib/supabase/admin";
import { generateDigest }      from "@/lib/analytics/digests";
import type { DigestSummary }  from "@/lib/analytics/digests";
import DigestCard, { DigestStatRow, DigestListRow } from "@/components/dashboard/DigestCard";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Data loader — fetch most recent stored digest or generate on the fly
// ---------------------------------------------------------------------------

async function getDigestData(supabaseUserId: string): Promise<{
  summary: DigestSummary;
  generatedAt: string;
  isLive: boolean;
}> {
  const supabase = createAdminClient();

  // Try to load the most recent stored digest (any type)
  const { data: stored } = await supabase
    .from("digests")
    .select("summary, created_at, period_start, period_end")
    .eq("user_id", supabaseUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as unknown as {
      data: {
        summary:      DigestSummary;
        created_at:   string;
        period_start: string;
        period_end:   string;
      } | null;
    };

  // If a stored digest exists and is less than 6 hours old, use it
  if (stored) {
    const ageMs = Date.now() - new Date(stored.created_at).getTime();
    if (ageMs < 6 * 60 * 60 * 1000) {
      return {
        summary:     stored.summary,
        generatedAt: stored.created_at,
        isLive:      false,
      };
    }
  }

  // Otherwise generate a fresh one for the current day (not persisted here —
  // the cron job handles persistence; this is just for display)
  const end   = new Date();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const summary = await generateDigest(supabaseUserId, start, end);
  return { summary, generatedAt: end.toISOString(), isLive: true };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DigestPage() {
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

  const { summary, generatedAt, isLive } = await getDigestData(user.id as string);

  const generatedLabel = new Date(generatedAt).toLocaleString("en-US", {
    month: "short",
    day:   "numeric",
    hour:  "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Digest</h1>
          <p className="mt-1 text-sm text-gray-500">
            A summary of what your autopilot handled.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {isLive && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
              Live
            </span>
          )}
          <span>Updated {generatedLabel}</span>
        </div>
      </div>

      {/* Activity summary */}
      <DigestCard title="Activity" count={summary.handledCount}>
        <div className="divide-y divide-gray-50">
          <DigestStatRow label="Total actions"   value={summary.handledCount} />
          <DigestStatRow label="Archived"        value={summary.archivedCount} />
          <DigestStatRow label="Unsubscribed"    value={summary.unsubscribedCount} />
          <DigestStatRow label="Needs review"    value={summary.reviewNeededCount} />
        </div>
        {summary.reviewNeededCount > 0 && (
          <div className="mt-4">
            <Link
              href="/dashboard/review"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Review {summary.reviewNeededCount} pending {summary.reviewNeededCount === 1 ? "item" : "items"} →
            </Link>
          </div>
        )}
      </DigestCard>

      {/* Important surfaced */}
      <DigestCard
        title="Important surfaced"
        count={summary.importantSurfaced.length}
        empty={
          summary.importantSurfaced.length === 0
            ? "No important messages detected in this period."
            : undefined
        }
      >
        <div className="divide-y divide-gray-50">
          {summary.importantSurfaced.map((item, idx) => (
            <DigestListRow
              key={idx}
              primary={item.subject ?? item.senderName ?? item.senderEmail ?? "Unknown"}
              secondary={
                [item.senderName, item.senderEmail].filter(Boolean).join(" · ") ||
                undefined
              }
              meta={
                item.reason
                  ? item.reason.replace(/_/g, " ")
                  : undefined
              }
            />
          ))}
        </div>
      </DigestCard>

      {/* Review needed */}
      {summary.reviewNeededCount > 0 && (
        <DigestCard title="Review needed" count={summary.reviewNeededCount}>
          <p className="text-sm text-gray-600">
            {summary.reviewNeededCount}{" "}
            {summary.reviewNeededCount === 1 ? "email needs" : "emails need"} a
            decision before autopilot acts.
          </p>
          <div className="mt-3">
            <Link
              href="/dashboard/review"
              className="inline-block rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Go to review queue
            </Link>
          </div>
        </DigestCard>
      )}

      {/* New patterns */}
      <DigestCard
        title="New senders detected"
        count={summary.newPatternsDetected.length}
        empty={
          summary.newPatternsDetected.length === 0
            ? "No new senders this period."
            : undefined
        }
      >
        <div className="divide-y divide-gray-50">
          {summary.newPatternsDetected.map((p, idx) => (
            <DigestListRow
              key={idx}
              primary={p.senderName ?? p.senderEmail}
              secondary={p.senderEmail !== (p.senderName ?? "") ? p.senderEmail : undefined}
              meta={p.detectedAs}
            />
          ))}
        </div>
      </DigestCard>

      {/* Unsubscribe candidates */}
      <DigestCard
        title="Suggested unsubscribes"
        count={summary.unsubscribeCandidates.length}
        empty={
          summary.unsubscribeCandidates.length === 0
            ? "No unsubscribe suggestions at this time."
            : undefined
        }
      >
        <div className="divide-y divide-gray-50">
          {summary.unsubscribeCandidates.map((c, idx) => (
            <DigestListRow
              key={idx}
              primary={c.senderName ?? c.senderEmail}
              secondary={c.senderName ? c.senderEmail : undefined}
              meta={`${Math.round(c.archiveRate * 100)}% archived · ${c.emailsPerMonth} emails`}
            />
          ))}
        </div>
        {summary.unsubscribeCandidates.length > 0 && (
          <div className="mt-4">
            <Link
              href="/dashboard/senders"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Manage senders →
            </Link>
          </div>
        )}
      </DigestCard>
    </div>
  );
}
