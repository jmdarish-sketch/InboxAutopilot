"use client";

import { useState }      from "react";
import Link              from "next/link";
import type { ReviewQueueItem } from "@/lib/dashboard/queries";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  promotion:           "Promo",
  newsletter:          "Newsletter",
  recurring_low_value: "Low value",
  spam_like:           "Spam-like",
  uncertain:           "Uncertain",
  critical_transactional: "Transactional",
  work_school:         "Work / School",
  personal_human:      "Personal",
  recurring_useful:    "Useful",
};

function categoryBadge(category: string | null) {
  if (!category) return null;
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      {label}
    </span>
  );
}

function SenderAvatar({ name, email }: { name: string | null; email: string | null }) {
  const letter = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
      {letter}
    </span>
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    uncertain_classification: "Classification uncertain",
    safe_mode_not_confident_enough: "Needs review",
    suggest_mode_no_auto_actions: "Awaiting approval",
    default_fallback: "Flagged for review",
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReviewQueuePreviewProps {
  items: ReviewQueueItem[];
}

export default function ReviewQueuePreview({ items: initialItems }: ReviewQueuePreviewProps) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function resolve(item: ReviewQueueItem, action: "keep" | "archive") {
    setLoading(item.queueId);
    try {
      const res = await fetch("/api/review/resolve", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          queueId:   item.queueId,
          messageId: item.messageId,
          action,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const label = action === "keep" ? "Kept in inbox" : "Archived";
      toast(label, "success");
      setItems(prev => prev.filter(i => i.queueId !== item.queueId));
    } catch {
      toast("Action failed. Please try again.", "error");
    } finally {
      setLoading(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-500">Your review queue is empty.</p>
        <p className="mt-1 text-xs text-gray-400">
          New uncertain emails will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      {items.map((item, idx) => (
        <div
          key={item.queueId}
          className={`flex items-center gap-4 px-5 py-4 ${
            idx < items.length - 1 ? "border-b border-gray-50" : ""
          }`}
        >
          {/* Avatar */}
          <SenderAvatar name={item.senderName} email={item.senderEmail} />

          {/* Details */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-900">
                {item.senderName ?? item.senderEmail ?? "Unknown sender"}
              </span>
              {categoryBadge(item.finalCategory)}
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {item.subject ?? "(no subject)"}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">{reasonLabel(item.queueReason)}</p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => resolve(item, "keep")}
              disabled={loading === item.queueId}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              onClick={() => resolve(item, "archive")}
              disabled={loading === item.queueId}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              Archive
            </button>
          </div>
        </div>
      ))}

      {/* View all link */}
      <div className="border-t border-gray-50 px-5 py-3">
        <Link
          href="/dashboard/review"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          View all review items →
        </Link>
      </div>
    </div>
  );
}
