"use client";

import { useState }         from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { HandledActionItem, HandledFilterTab } from "@/lib/dashboard/handledQueries";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACTION_LABELS: Record<string, string> = {
  archive:     "Archived",
  unsubscribe: "Unsubscribed",
  rule_change: "Rule changed",
  restore:     "Restored",
  mute:        "Muted",
};

const ACTION_COLORS: Record<string, string> = {
  archive:     "bg-amber-50 text-amber-700 ring-amber-200",
  unsubscribe: "bg-purple-50 text-purple-700 ring-purple-200",
  rule_change: "bg-blue-50 text-blue-700 ring-blue-200",
  restore:     "bg-green-50 text-green-700 ring-green-200",
  mute:        "bg-gray-50 text-gray-600 ring-gray-200",
};

const SOURCE_LABELS: Record<string, string> = {
  system_autopilot: "Autopilot",
  user_manual:      "Manual",
  initial_cleanup:  "Cleanup",
  review_queue:     "Review",
};

function buildSummary(item: HandledActionItem): string {
  if (item.subject) return item.subject;
  if (item.actionType === "archive" && item.archivedCount > 1) {
    return `${item.archivedCount} emails archived`;
  }
  if (item.actionType === "unsubscribe") return "Unsubscribe requested";
  if (item.actionType === "rule_change") {
    return item.reason?.replace(/_/g, " ") ?? "Rule updated";
  }
  return "—";
}

// ---------------------------------------------------------------------------
// StatusChip
// ---------------------------------------------------------------------------

function StatusChip({ item }: { item: HandledActionItem }) {
  if (item.undone) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
        Undone
      </span>
    );
  }
  if (item.status === "failed") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
      Done
    </span>
  );
}

// ---------------------------------------------------------------------------
// UndoButton
// ---------------------------------------------------------------------------

function UndoButton({
  item,
  onUndone,
}: {
  item:     HandledActionItem;
  onUndone: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const { toast } = useToast();

  if (!item.reversible || item.undone || item.status === "failed") return null;
  if (item.actionType === "restore") return null;

  async function handleUndo() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recovery/undo", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ actionId: item.actionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed");
      }
      toast("Action undone", "success");
      onUndone(item.actionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      setError(msg);
      toast(msg, "error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleUndo}
        disabled={loading}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
      >
        {loading ? (
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
        ) : "Undo"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const TABS: { value: HandledFilterTab; label: string }[] = [
  { value: "today",       label: "Today" },
  { value: "7days",       label: "7 days" },
  { value: "30days",      label: "30 days" },
  { value: "archive",     label: "Archives" },
  { value: "unsubscribe", label: "Unsubscribes" },
  { value: "muted",       label: "Muted" },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface HandledActionsTableProps {
  items:     HandledActionItem[];
  activeTab: HandledFilterTab;
}

export default function HandledActionsTable({
  items: initialItems,
  activeTab,
}: HandledActionsTableProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState(initialItems);

  function handleUndone(actionId: string) {
    setItems(prev =>
      prev.map(item => item.actionId === actionId ? { ...item, undone: true } : item)
    );
  }

  function setTab(tab: HandledFilterTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-100">
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`
              flex-shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors
              ${activeTab === t.value
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <p className="text-sm text-gray-500">No actions in this view.</p>
          <p className="mt-1 text-xs text-gray-400">
            Autopilot actions will appear here as your inbox is processed.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 w-24">Time</th>
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3 hidden md:table-cell">Subject / Summary</th>
                <th className="px-4 py-3 hidden sm:table-cell">Action</th>
                <th className="px-4 py-3 hidden lg:table-cell">Reason</th>
                <th className="px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 text-right">Undo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr
                  key={item.actionId}
                  className={item.undone ? "opacity-40" : ""}
                >
                  {/* Time */}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                    {formatDate(item.createdAt)}
                  </td>

                  {/* Sender */}
                  <td className="px-4 py-3">
                    {item.senderName || item.senderEmail ? (
                      <div className="min-w-0">
                        {item.senderName && (
                          <p className="truncate text-sm font-medium text-gray-900">
                            {item.senderName}
                          </p>
                        )}
                        {item.senderEmail && (
                          <p className="truncate text-xs text-gray-400">
                            {item.senderEmail}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>

                  {/* Subject / Summary */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="max-w-xs truncate text-sm text-gray-700">
                      {buildSummary(item)}
                    </p>
                    {item.snippet && item.subject && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400">
                        {item.snippet}
                      </p>
                    )}
                  </td>

                  {/* Action type */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_COLORS[item.actionType] ?? "bg-gray-50 text-gray-600 ring-gray-200"}`}>
                        {ACTION_LABELS[item.actionType] ?? item.actionType}
                      </span>
                      <span className="text-xs text-gray-400">
                        {SOURCE_LABELS[item.actionSource] ?? item.actionSource}
                      </span>
                    </div>
                  </td>

                  {/* Reason */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <p className="max-w-[200px] truncate text-xs text-gray-500">
                      {item.reason?.replace(/_/g, " ") ?? "—"}
                    </p>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <StatusChip item={item} />
                  </td>

                  {/* Undo */}
                  <td className="px-4 py-3 text-right">
                    <UndoButton item={item} onUndone={handleUndone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
