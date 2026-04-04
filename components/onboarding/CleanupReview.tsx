"use client";

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";
import type {
  CleanupRecommendation,
  ProtectedSenderSummary,
} from "@/lib/cleanup/recommendations";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SenderAvatar({ name, email }: { name: string | null; email: string }) {
  const letter = (name?.[0] ?? email[0]).toUpperCase();
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
      {letter}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles: Record<string, string> = {
    High:   "bg-green-100 text-green-800",
    Medium: "bg-amber-100 text-amber-800",
    Low:    "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>
      {level} confidence
    </span>
  );
}

function ActionBadge({ action }: { action: "archive" | "unsubscribe_and_archive" }) {
  if (action === "unsubscribe_and_archive") {
    return (
      <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
        Unsubscribe & archive
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Archive
    </span>
  );
}

interface RecommendationCardProps {
  rec:      CleanupRecommendation;
  selected: boolean;
  onToggle: () => void;
}

function RecommendationCard({ rec, selected, onToggle }: RecommendationCardProps) {
  const displayCount = rec.recentCount > 0 ? rec.recentCount : rec.messageCount;
  const timeframe    = rec.recentCount > 0 ? "last 30 days" : "total";

  return (
    <div
      className={`rounded-2xl border bg-white p-5 transition-opacity ${
        selected ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <SenderAvatar name={rec.senderName} email={rec.senderEmail} />

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Top row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {rec.senderName ?? rec.senderEmail}
            </span>
            <ActionBadge action={rec.suggestedAction} />
            <ConfidenceBadge level={rec.confidence} />
          </div>

          <p className="mt-0.5 truncate text-xs text-gray-400">{rec.senderEmail}</p>

          {/* Stats */}
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span>
              <span className="font-semibold tabular-nums text-gray-800">
                {displayCount.toLocaleString()}
              </span>{" "}
              email{displayCount !== 1 ? "s" : ""} ({timeframe})
            </span>
            <span className="text-gray-300">·</span>
            <span>
              <span
                className={`font-semibold tabular-nums ${
                  rec.openRate === 0 ? "text-red-500" : "text-gray-800"
                }`}
              >
                {rec.openRate}%
              </span>{" "}
              opened
            </span>
          </div>

          {/* Reason */}
          <p className="mt-2 text-xs text-gray-500">{rec.reason}</p>

          {/* Sample subjects */}
          {rec.sampleSubjects.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {rec.sampleSubjects.map((subj, i) => (
                <li
                  key={i}
                  className="truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-500"
                >
                  {subj}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Checkbox */}
        <div className="shrink-0 pt-0.5">
          <button
            type="button"
            onClick={onToggle}
            aria-label={selected ? "Deselect this sender" : "Select this sender"}
            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
              selected
                ? "border-blue-600 bg-blue-600"
                : "border-gray-300 bg-white"
            }`}
          >
            {selected && (
              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProtectedCard({ sender }: { sender: ProtectedSenderSummary }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4">
      <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
        {sender.reasonIcon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {sender.senderName ?? sender.senderEmail}
        </p>
        <p className="truncate text-xs text-gray-400">{sender.senderEmail}</p>
        <p className="mt-0.5 text-xs font-medium text-gray-500">{sender.protectionReason}</p>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
        Protected
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticky footer
// ---------------------------------------------------------------------------

interface FooterProps {
  archiveCount:    number;
  unsubCount:      number;
  onBack:          () => void;
  onApply:         () => void;
  applying:        boolean;
}

function StickyFooter({ archiveCount, unsubCount, onBack, onApply, applying }: FooterProps) {
  const total = archiveCount + unsubCount;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4">
        {/* Counts */}
        <div className="flex flex-1 flex-wrap items-center gap-3 text-sm text-gray-600">
          {archiveCount > 0 && (
            <span>
              <span className="font-semibold text-gray-900">{archiveCount}</span>{" "}
              archive{archiveCount !== 1 ? "s" : ""}
            </span>
          )}
          {archiveCount > 0 && unsubCount > 0 && (
            <span className="text-gray-300">·</span>
          )}
          {unsubCount > 0 && (
            <span>
              <span className="font-semibold text-gray-900">{unsubCount}</span>{" "}
              unsubscribe{unsubCount !== 1 ? "s" : ""}
            </span>
          )}
          {total === 0 && (
            <span className="text-gray-400">No actions selected</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={applying}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying || total === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {applying ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Applying…
              </>
            ) : (
              <>Apply cleanup</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CleanupReviewProps {
  recommendations:  CleanupRecommendation[];
  protectedSenders: ProtectedSenderSummary[];
}

export default function CleanupReview({
  recommendations,
  protectedSenders,
}: CleanupReviewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const archiveRecs = recommendations.filter(r => r.suggestedAction === "archive");
  const unsubRecs   = recommendations.filter(r => r.suggestedAction === "unsubscribe_and_archive");

  const selectedArchive = archiveRecs.filter(r => !skipped.has(r.senderId));
  const selectedUnsub   = unsubRecs.filter(r => !skipped.has(r.senderId));

  function toggle(senderId: string) {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(senderId)) next.delete(senderId);
      else next.add(senderId);
      return next;
    });
  }

  async function applyCleanup() {
    setApplying(true);
    setError(null);

    const selections = recommendations.map(r => ({
      senderId: r.senderId,
      action:   skipped.has(r.senderId) ? ("keep" as const) : r.suggestedAction,
    }));

    try {
      const res = await fetch("/api/onboarding/apply-cleanup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ selections }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Cleanup failed");
      }

      toast("Cleanup applied successfully", "success");
      startTransition(() => {
        router.push("/onboarding/autopilot");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      toast(msg, "error");
      setApplying(false);
    }
  }

  // Empty state — no recommendations to review (auto-cleanup may have handled everything)
  if (recommendations.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="mt-5 text-xl font-bold text-gray-900">Your inbox is already clean!</h2>
            <p className="mt-2 text-sm text-gray-500">
              The auto-cleanup handled the obvious junk. No additional cleanup decisions are needed right now.
            </p>
            <button
              onClick={() => {
                // Advance onboarding status since we're skipping manual cleanup
                void fetch("/api/onboarding/apply-cleanup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ selections: [] }),
                }).then(() => {
                  router.push("/onboarding/autopilot");
                });
              }}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Continue to Autopilot Setup
            </button>
          </div>

          {/* Still show protected senders for trust */}
          {protectedSenders.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Protected senders</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {protectedSenders.map(s => (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4"
                  >
                    <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
                      {s.reasonIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {s.senderName ?? s.senderEmail}
                      </p>
                      <p className="truncate text-xs text-gray-400">{s.senderEmail}</p>
                      <p className="mt-0.5 text-xs font-medium text-gray-500">{s.protectionReason}</p>
                    </div>
                    <span className="ml-auto shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Protected
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32 pt-12">
      <div className="mx-auto max-w-3xl space-y-10 px-4">

        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Review cleanup plan</h1>
          <p className="mt-2 text-base text-gray-500">
            Select which senders to clean up. You&apos;re in control — nothing happens until you apply.
          </p>
        </header>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Module A: Archive */}
        {archiveRecs.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Safe to archive</h2>
              <p className="mt-1 text-sm text-gray-400">
                These senders send frequently but get little engagement. Archive their emails and future messages automatically.
              </p>
            </div>
            <div className="space-y-3">
              {archiveRecs.map(rec => (
                <RecommendationCard
                  key={rec.senderId}
                  rec={rec}
                  selected={!skipped.has(rec.senderId)}
                  onToggle={() => toggle(rec.senderId)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Module B: Unsubscribe + Archive */}
        {unsubRecs.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Unsubscribe suggestions</h2>
              <p className="mt-1 text-sm text-gray-400">
                These senders include unsubscribe links. We&apos;ll try to unsubscribe and archive their emails.
              </p>
            </div>
            <div className="space-y-3">
              {unsubRecs.map(rec => (
                <RecommendationCard
                  key={rec.senderId}
                  rec={rec}
                  selected={!skipped.has(rec.senderId)}
                  onToggle={() => toggle(rec.senderId)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Module C: Protected senders */}
        {protectedSenders.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Protected senders</h2>
              <p className="mt-1 text-sm text-gray-400">
                These senders are marked safe. We will never auto-archive their emails.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {protectedSenders.map(s => (
                <ProtectedCard key={s.id} sender={s} />
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Sticky footer */}
      <StickyFooter
        archiveCount={selectedArchive.length}
        unsubCount={selectedUnsub.length}
        onBack={() => router.push("/onboarding/diagnosis")}
        onApply={applyCleanup}
        applying={applying}
      />
    </div>
  );
}
