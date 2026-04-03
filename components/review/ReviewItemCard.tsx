"use client";

import { useState } from "react";
import ReviewActionBar from "./ReviewActionBar";
import type { ReviewAction } from "./ReviewActionBar";
import type { FullReviewItem } from "@/lib/review/queries";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Static maps
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  promotion:              "Promo",
  newsletter:             "Newsletter",
  recurring_low_value:    "Low value",
  spam_like:              "Spam-like",
  uncertain:              "Uncertain",
  critical_transactional: "Transactional",
  work_school:            "Work / School",
  personal_human:         "Personal",
  recurring_useful:       "Useful",
};

const REASON_LABELS: Record<string, string> = {
  uncertain_classification:       "Uncertain classification",
  safe_mode_not_confident_enough: "Not confident enough",
  suggest_mode_no_auto_actions:   "Awaiting approval",
  aggressive_mode_still_uncertain: "Still uncertain",
  default_fallback:               "Flagged for review",
  new_sender:                     "New sender",
  high_risk_protected:            "Risk detected",
  llm_archive_blocked_by_risk:    "Risk flagged",
  fell_between_thresholds:        "Borderline",
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function confidenceLevel(score: number | null): "High" | "Medium" | "Low" {
  if (score === null) return "Low";
  if (score >= 0.85) return "High";
  if (score >= 0.65) return "Medium";
  return "Low";
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff  = Date.now() - new Date(iso).getTime();
  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor(diff / 60_000);
  if (days  > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins  > 0) return `${mins}m ago`;
  return "just now";
}

/** Build a human-readable explanation for why this email is in the review queue. */
function buildWhyText(item: FullReviewItem): string {
  const senderLabel = item.senderName ?? item.senderEmail ?? "this sender";
  const isNew       = item.senderMessageCount < 5;
  const hasSub      = item.hasUnsubscribeHeader;

  if (isNew && hasSub) {
    return `You haven't seen much from ${senderLabel} before, but this message includes an unsubscribe link — it may be a mailing list.`;
  }
  if (isNew) {
    return `This is one of the first emails from ${senderLabel}. The system isn't sure yet how to classify it.`;
  }
  if (item.finalCategory === "uncertain") {
    return `The classifier couldn't confidently place this email in a category. It may need your input to improve future decisions.`;
  }
  if (item.finalCategory === "promotion" || item.finalCategory === "newsletter") {
    return `This looks like a promotional email, but confidence was below the autopilot threshold. Your decision will help train the system.`;
  }
  if (item.finalCategory === "critical_transactional" || item.finalCategory === "work_school") {
    return `This could be important — it may contain transactional or work-related content. The system held it for your review.`;
  }
  if (item.senderMessageCount > 10 && item.senderOpenCount === 0) {
    return `${senderLabel} has sent ${item.senderMessageCount} emails but you've opened none. Autopilot flagged it for confirmation before archiving.`;
  }
  return `The system wasn't confident enough to act automatically. Your decision helps improve future accuracy.`;
}

/** Parse action_reason (comma-separated tags) into pill labels. */
function reasonPills(actionReason: string | null, queueReason: string): string[] {
  const pills: string[] = [];
  if (actionReason) {
    for (const tag of actionReason.split(",")) {
      const trimmed = tag.trim();
      if (trimmed) {
        pills.push(trimmed.replace(/_/g, " "));
      }
    }
  }
  const queueLabel = REASON_LABELS[queueReason];
  if (queueLabel && !pills.includes(queueLabel)) {
    pills.unshift(queueLabel);
  }
  return pills.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ score }: { score: number | null }) {
  const level  = confidenceLevel(score);
  const styles = {
    High:   "bg-green-100 text-green-800",
    Medium: "bg-amber-100 text-amber-800",
    Low:    "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>
      {level} conf.
    </span>
  );
}

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ReviewItemCard
// ---------------------------------------------------------------------------

interface ReviewItemCardProps {
  item:     FullReviewItem;
  onResolved: (queueId: string) => void;
}

export default function ReviewItemCard({ item, onResolved }: ReviewItemCardProps) {
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const { toast } = useToast();

  const initial    = (item.senderName?.[0] ?? item.senderEmail?.[0] ?? "?").toUpperCase();
  const openRate   = item.senderMessageCount > 0
    ? Math.round((item.senderOpenCount / item.senderMessageCount) * 100)
    : 0;
  const pills      = reasonPills(item.actionReason, item.queueReason);
  const whyText    = buildWhyText(item);

  const NEEDS_CONFIRM: ReviewAction[] = ["always_archive", "unsubscribe"];

  const CONFIRM_TEXT: Record<string, { title: string; description: string }> = {
    always_archive: {
      title:       "Always archive this sender?",
      description: `All future emails from ${item.senderName ?? item.senderEmail ?? "this sender"} will be automatically archived.`,
    },
    unsubscribe: {
      title:       "Unsubscribe from this sender?",
      description: `We'll attempt to unsubscribe you from ${item.senderName ?? item.senderEmail ?? "this sender"}. This may not be reversible at the sender level.`,
    },
  };

  const ACTION_LABELS: Record<string, string> = {
    keep:           "Kept in inbox",
    archive:        "Archived",
    always_keep:    "Always keeping sender",
    always_archive: "Always archiving sender",
    unsubscribe:    "Unsubscribed",
  };

  async function executeAction(action: ReviewAction) {
    setLoading(true);
    try {
      const res = await fetch("/api/review/resolve", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId:   item.queueId,
          messageId: item.messageId,
          senderId:  item.senderId,
          action,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(ACTION_LABELS[action] ?? "Done", "success");
      onResolved(item.queueId);
    } catch {
      toast("Action failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleAction(action: ReviewAction) {
    if (NEEDS_CONFIRM.includes(action)) {
      setPendingAction(action);
    } else {
      void executeAction(action);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white transition-shadow hover:shadow-sm">

      {/* ── Top row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 px-5 pt-5">
        {/* Avatar */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
          {initial}
        </span>

        {/* Sender + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
              {item.senderName ?? item.senderEmail ?? "Unknown sender"}
            </span>
            <ConfidenceBadge score={item.confidenceScore} />
            <CategoryBadge  category={item.finalCategory} />
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-400">{item.senderEmail}</p>

          {/* Reason pills */}
          {pills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pills.map((p, i) => (
                <span key={i} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Subject + snippet ────────────────────────────────────────────── */}
      <div className="px-5 pt-3">
        <p className="text-sm font-medium text-gray-900">
          {item.subject ?? "(no subject)"}
        </p>
        {item.snippet && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.snippet}</p>
        )}
      </div>

      {/* ── Metadata row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-5 pt-2 text-xs text-gray-400">
        {item.receivedAt && (
          <span>{formatRelativeTime(item.receivedAt)}</span>
        )}
        {item.senderMessageCount > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <span>
              {item.senderMessageCount} email{item.senderMessageCount !== 1 ? "s" : ""} from this sender
            </span>
            <span className="text-gray-300">·</span>
            <span className={openRate === 0 ? "text-red-400" : ""}>{openRate}% opened</span>
          </>
        )}
        {item.senderMessageCount < 5 && (
          <>
            <span className="text-gray-300">·</span>
            <span className="font-medium text-amber-600">New sender</span>
          </>
        )}
      </div>

      {/* ── "Why this is here" ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-2 flex w-full items-center gap-1.5 px-5 py-1.5 text-left text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <svg className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        Why is this here?
      </button>
      {expanded && (
        <p className="px-5 pb-3 text-xs text-gray-500">{whyText}</p>
      )}

      {/* ── Action bar ───────────────────────────────────────────────────── */}
      <div className="border-t border-gray-50 px-5 py-4">
        <ReviewActionBar
          onAction={handleAction}
          loading={loading}
          hasUnsubscribe={item.hasUnsubscribeHeader}
          compact
        />
      </div>

      {/* ── Confirm dialog ────────────────────────────────────────────── */}
      {pendingAction && CONFIRM_TEXT[pendingAction] && (
        <ConfirmDialog
          open={true}
          title={CONFIRM_TEXT[pendingAction].title}
          description={CONFIRM_TEXT[pendingAction].description}
          confirmLabel={pendingAction === "unsubscribe" ? "Unsubscribe" : "Always archive"}
          danger
          loading={loading}
          onConfirm={() => {
            const action = pendingAction;
            setPendingAction(null);
            void executeAction(action);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
