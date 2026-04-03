"use client";

import { useState }         from "react";
import Link                 from "next/link";
import type { HandledActionItem } from "@/lib/dashboard/handledQueries";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function buildLabel(item: HandledActionItem): string {
  const sender = item.senderName ?? item.senderEmail ?? "unknown sender";
  if (item.actionType === "archive") {
    return item.archivedCount > 1
      ? `Archived ${item.archivedCount} emails from ${sender}`
      : `Archived email from ${sender}`;
  }
  if (item.actionType === "unsubscribe") return `Unsubscribed from ${sender}`;
  if (item.actionType === "restore")     return `Restored email from ${sender}`;
  if (item.actionType === "rule_change") return `Rule changed for ${sender}`;
  return `${item.actionType} — ${sender}`;
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    system_autopilot: "Autopilot",
    initial_cleanup:  "Initial cleanup",
    review_queue:     "Review queue",
    user_manual:      "Manual",
  };
  return map[source] ?? source;
}

function ActionIcon({ type }: { type: string }) {
  if (type === "archive") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
        <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      </span>
    );
  }
  if (type === "unsubscribe") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-50">
        <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </span>
    );
  }
  if (type === "restore") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-50">
        <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RecentActionsFeedProps {
  actions: HandledActionItem[];
}

export default function RecentActionsFeed({ actions: initialActions }: RecentActionsFeedProps) {
  const [actions, setActions] = useState(initialActions);
  const [undoing, setUndoing] = useState<string | null>(null);
  const { toast } = useToast();

  async function undo(actionId: string) {
    setUndoing(actionId);
    try {
      const res = await fetch("/api/recovery/undo", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ actionId }),
      });
      if (res.ok) {
        toast("Action undone", "success");
        setActions(prev =>
          prev.map(a => a.actionId === actionId ? { ...a, undone: true } : a)
        );
      } else {
        toast("Undo failed", "error");
      }
    } catch {
      toast("Undo failed", "error");
    } finally {
      setUndoing(null);
    }
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-500">No recent actions yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Autopilot actions will appear here as your inbox receives new email.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      {actions.map((action, idx) => (
        <div
          key={action.actionId}
          className={`flex items-start gap-4 px-5 py-4 transition-opacity ${
            idx < actions.length - 1 ? "border-b border-gray-50" : ""
          } ${action.undone ? "opacity-40" : ""}`}
        >
          <ActionIcon type={action.actionType} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {buildLabel(action)}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">
                {formatRelativeTime(action.createdAt)}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">
                {sourceLabel(action.actionSource)}
              </span>
              {action.reason && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    {action.reason.replace(/_/g, " ")}
                  </span>
                </>
              )}
            </div>
          </div>

          {action.reversible && !action.undone && action.actionType !== "restore" ? (
            <button
              onClick={() => undo(action.actionId)}
              disabled={undoing === action.actionId}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {undoing === action.actionId ? "…" : "Undo"}
            </button>
          ) : action.undone ? (
            <span className="shrink-0 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400">
              Undone
            </span>
          ) : null}
        </div>
      ))}

      {/* Link to full handled page */}
      <div className="border-t border-gray-50 px-5 py-3">
        <Link
          href="/dashboard/handled"
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          View all handled actions →
        </Link>
      </div>
    </div>
  );
}
