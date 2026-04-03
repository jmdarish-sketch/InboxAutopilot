"use client";

import { useState, useMemo } from "react";
import SearchInput from "@/components/shared/SearchInput";
import type { RecoveryItem, RecoveryActionType } from "@/app/api/recovery/list/route";
import { useToast } from "@/components/shared/ToastProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

type FilterTab = "all" | RecoveryActionType;

interface RecoveryTableProps {
  initialItems: RecoveryItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  archive:     "Archived",
  unsubscribe: "Unsubscribed",
  rule_change: "Rule changed",
  restore:     "Restored",
};

const ACTION_COLORS: Record<string, string> = {
  archive:     "bg-amber-50 text-amber-700 ring-amber-200",
  unsubscribe: "bg-purple-50 text-purple-700 ring-purple-200",
  rule_change: "bg-blue-50 text-blue-700 ring-blue-200",
  restore:     "bg-green-50 text-green-700 ring-green-200",
};

const SOURCE_LABELS: Record<string, string> = {
  system_autopilot: "Autopilot",
  user_manual:      "Manual",
  initial_cleanup:  "Cleanup",
  review_queue:     "Review queue",
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusChip({ item }: { item: RecoveryItem }) {
  if (item.undone) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
        Undone
      </span>
    );
  }
  if (!item.reversible) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
        Final
      </span>
    );
  }
  if (item.actionType === "unsubscribe") {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700 ring-1 ring-inset ring-yellow-200">
        Partially reversible
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
      Reversible
    </span>
  );
}

// ── UndoButton ─────────────────────────────────────────────────────────────────

function UndoButton({
  item,
  onUndone,
}: {
  item: RecoveryItem;
  onUndone: (id: string) => void;
}) {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const { toast } = useToast();

  if (item.undone || !item.reversible) return null;
  if (item.actionType === "restore") return null;

  async function handleUndo() {
    if (loading) return;

    if (item.actionType === "unsubscribe" && !showNote) {
      setShowNote(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/recovery/undo", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ actionId: item.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Something went wrong");
      }

      toast("Action undone successfully", "success");
      onUndone(item.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast(msg, "error");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {showNote && item.actionType === "unsubscribe" && (
        <p className="max-w-xs text-right text-xs text-gray-500">
          We can&apos;t reverse the sender-side unsubscribe, but we&apos;ll mark this sender as
          protected so future emails will be kept.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
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
        ) : showNote && item.actionType === "unsubscribe" ? (
          "Confirm undo"
        ) : (
          "Undo"
        )}
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const TABS: { value: FilterTab; label: string }[] = [
  { value: "all",         label: "All actions" },
  { value: "archive",     label: "Archived" },
  { value: "unsubscribe", label: "Unsubscribed" },
  { value: "rule_change", label: "Rule changes" },
];

export default function RecoveryTable({ initialItems }: RecoveryTableProps) {
  const [items,  setItems]  = useState<RecoveryItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [tab,    setTab]    = useState<FilterTab>("all");

  function handleUndone(id: string) {
    setItems(prev =>
      prev.map(item => item.id === id ? { ...item, undone: true } : item)
    );
  }

  const filtered = useMemo(() => {
    let list = items;

    if (tab !== "all") {
      list = list.filter(item => item.actionType === tab);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(item =>
        (item.senderEmail?.toLowerCase().includes(q) ?? false) ||
        (item.senderName?.toLowerCase().includes(q)  ?? false) ||
        (item.reason?.toLowerCase().includes(q)       ?? false) ||
        item.actionType.includes(q)
      );
    }

    return list;
  }, [items, tab, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Find something the autopilot handled…"
      />

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map(t => {
          const count = t.value === "all"
            ? items.length
            : items.filter(i => i.actionType === t.value).length;

          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`
                flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors
                ${tab === t.value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
                }
              `}
            >
              {t.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === t.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <p className="text-sm text-gray-500">
            {search.trim() ? `No results for "${search}"` : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3 hidden sm:table-cell">Action</th>
                <th className="px-4 py-3 hidden md:table-cell">Reason</th>
                <th className="px-4 py-3 hidden lg:table-cell">Status</th>
                <th className="px-4 py-3 text-right">Undo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className={item.undone ? "opacity-50" : ""}
                >
                  {/* When */}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {formatRelativeTime(item.createdAt)}
                  </td>

                  {/* Sender */}
                  <td className="px-4 py-3">
                    {item.senderName || item.senderEmail ? (
                      <div className="min-w-0">
                        {item.senderName && (
                          <p className="truncate font-medium text-gray-900">{item.senderName}</p>
                        )}
                        {item.senderEmail && (
                          <p className="truncate text-xs text-gray-400">{item.senderEmail}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unknown sender</span>
                    )}
                  </td>

                  {/* Action */}
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
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="max-w-xs truncate text-xs text-gray-500">
                      {item.reason?.replace(/_/g, " ") ?? "—"}
                    </p>
                    {typeof item.metadata?.archived_count === "number" && (
                      <p className="text-xs text-gray-400">
                        {item.metadata.archived_count} email{item.metadata.archived_count !== 1 ? "s" : ""} affected
                      </p>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 hidden lg:table-cell">
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
