"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { SenderListItem } from "@/lib/senders/queries";
import SearchInput from "@/components/shared/SearchInput";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/ToastProvider";

// ── Types ────────────────────────────────────────────────────────────────────

type FilterValue = "all" | "protected" | "archived" | "review" | "unsubscribed";
type SortValue   = "most_frequent" | "highest_clutter" | "highest_importance" | "newest";

interface SenderTableProps {
  senders: SenderListItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  promotion:          "Promo",
  newsletter:         "Newsletter",
  work_school:        "Work/School",
  transactional:      "Transactional",
  personal:           "Personal",
  recurring_useful:   "Recurring",
  recurring_low_value:"Low-value",
  spam_like:          "Spam-like",
  uncertain:          "Uncertain",
};

const CATEGORY_COLORS: Record<string, string> = {
  promotion:          "bg-orange-50 text-orange-700 ring-orange-200",
  newsletter:         "bg-blue-50 text-blue-700 ring-blue-200",
  work_school:        "bg-purple-50 text-purple-700 ring-purple-200",
  transactional:      "bg-teal-50 text-teal-700 ring-teal-200",
  personal:           "bg-green-50 text-green-700 ring-green-200",
  recurring_useful:   "bg-indigo-50 text-indigo-700 ring-indigo-200",
  recurring_low_value:"bg-yellow-50 text-yellow-700 ring-yellow-200",
  spam_like:          "bg-red-50 text-red-700 ring-red-200",
  uncertain:          "bg-gray-50 text-gray-600 ring-gray-200",
};

const RULE_LABELS: Record<string, { label: string; color: string }> = {
  always_keep:    { label: "Always keep",    color: "bg-green-50 text-green-700 ring-green-200" },
  always_archive: { label: "Always archive", color: "bg-red-50 text-red-700 ring-red-200" },
  digest_only:    { label: "Digest only",    color: "bg-blue-50 text-blue-700 ring-blue-200" },
  always_review:  { label: "Always review",  color: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
};

function SenderAvatar({ name, email }: { name: string | null; email: string }) {
  const initials = name
    ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : email[0].toUpperCase();

  const hue = email.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}, 55%, 48%)` }}
    >
      {initials}
    </div>
  );
}

function EngagementMini({
  openCount,
  replyCount,
  restoreCount,
  messageCount,
}: {
  openCount: number;
  replyCount: number;
  restoreCount: number;
  messageCount: number;
}) {
  const pct = (n: number) => (messageCount > 0 ? Math.round((n / messageCount) * 100) : 0);

  return (
    <div className="flex flex-col gap-0.5 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
        {pct(openCount)}% open
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
        {pct(replyCount)}% reply
      </span>
      {restoreCount > 0 && (
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          {restoreCount} restore{restoreCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const HANDLED_STATES = new Set(["always_keep", "always_archive", "blocked"]);

export default function SenderTable({ senders: initialSenders }: SenderTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [senders, setSenders] = useState(initialSenders);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<FilterValue>("all");
  const [sort, setSort]       = useState<SortValue>("most_frequent");
  const [confirmSender, setConfirmSender] = useState<SenderListItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleUnsubscribeArchive(sender: SenderListItem) {
    setConfirmSender(null);
    setActionLoading(sender.id);
    try {
      const res = await fetch(`/api/senders/${sender.id}/rule`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "try_unsubscribe" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast(`Unsubscribed & archived: ${sender.senderName ?? sender.senderEmail}`, "success");
      // Optimistic update — mark as always_archive in local state
      setSenders(prev =>
        prev.map(s =>
          s.id === sender.id
            ? { ...s, activeRuleAction: "always_archive", learnedState: "always_archive" }
            : s
        )
      );
    } catch {
      toast("Action failed. Try again.", "error");
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = useMemo(() => {
    let list = [...senders];

    // Filter
    if (filter === "protected") {
      list = list.filter(s => s.activeRuleAction === "always_keep" || s.learnedState === "always_keep");
    } else if (filter === "archived") {
      list = list.filter(s => s.activeRuleAction === "always_archive" || s.learnedState === "always_archive");
    } else if (filter === "review") {
      list = list.filter(s => s.reviewRequired || s.activeRuleAction === "always_review");
    } else if (filter === "unsubscribed") {
      list = list.filter(s => s.unsubscribeCount > 0);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        s =>
          s.senderEmail.toLowerCase().includes(q) ||
          (s.senderName?.toLowerCase().includes(q) ?? false) ||
          s.senderDomain.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "most_frequent") {
      list.sort((a, b) => b.messageCount - a.messageCount);
    } else if (sort === "highest_clutter") {
      list.sort((a, b) => b.clutterScore - a.clutterScore);
    } else if (sort === "highest_importance") {
      list.sort((a, b) => b.importanceScore - a.importanceScore);
    } else if (sort === "newest") {
      list.sort((a, b) => {
        const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return tb - ta;
      });
    }

    return list;
  }, [senders, filter, sort, search]);

  const FILTERS: { value: FilterValue; label: string }[] = [
    { value: "all",          label: "All" },
    { value: "protected",    label: "Protected" },
    { value: "archived",     label: "Archived" },
    { value: "review",       label: "Review" },
    { value: "unsubscribed", label: "Unsubscribed" },
  ];

  const SORTS: { value: SortValue; label: string }[] = [
    { value: "most_frequent",       label: "Most frequent" },
    { value: "highest_clutter",     label: "Highest clutter" },
    { value: "highest_importance",  label: "Highest importance" },
    { value: "newest",              label: "Newest" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search senders…"
          className="flex-1"
        />

        <div className="flex gap-2">
          {/* Filter dropdown */}
          <div className="relative">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as FilterValue)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {FILTERS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortValue)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORTS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">
        {filtered.length} sender{filtered.length !== 1 ? "s" : ""}
        {search.trim() ? ` matching "${search}"` : ""}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
          <p className="text-sm text-gray-500">No senders found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3 hidden md:table-cell">Category</th>
                <th className="px-4 py-3 hidden sm:table-cell">Emails/mo</th>
                <th className="px-4 py-3 hidden lg:table-cell">Engagement</th>
                <th className="px-4 py-3 hidden md:table-cell">Rule</th>
                <th className="px-4 py-3 hidden lg:table-cell">State</th>
                <th className="px-4 py-3 text-right">Quick action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(sender => {
                const categoryKey  = sender.senderCategory ?? "uncertain";
                const categoryLabel = CATEGORY_LABELS[categoryKey] ?? categoryKey;
                const categoryColor = CATEGORY_COLORS[categoryKey] ?? CATEGORY_COLORS.uncertain;
                const ruleInfo     = sender.activeRuleAction ? RULE_LABELS[sender.activeRuleAction] : null;

                return (
                  <tr
                    key={sender.id}
                    onClick={() => router.push(`/dashboard/senders/${sender.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    {/* Sender */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <SenderAvatar name={sender.senderName} email={sender.senderEmail} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {sender.senderName ?? sender.senderDomain}
                          </p>
                          <p className="truncate text-xs text-gray-400">{sender.senderEmail}</p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${categoryColor}`}>
                        {categoryLabel}
                      </span>
                    </td>

                    {/* Emails / month */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-medium text-gray-900">{sender.recentCount}</span>
                      <span className="text-gray-400"> / {sender.messageCount} total</span>
                    </td>

                    {/* Engagement */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <EngagementMini
                        openCount={sender.openCount}
                        replyCount={sender.replyCount}
                        restoreCount={sender.restoreCount}
                        messageCount={sender.messageCount}
                      />
                    </td>

                    {/* Rule */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {ruleInfo ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ruleInfo.color}`}>
                          {ruleInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No rule</span>
                      )}
                    </td>

                    {/* Learned state */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs capitalize text-gray-500">
                        {sender.learnedState.replace(/_/g, " ")}
                      </span>
                    </td>

                    {/* Quick action */}
                    <td className="px-4 py-3 text-right">
                      {!HANDLED_STATES.has(sender.learnedState) &&
                       sender.activeRuleAction !== "always_keep" &&
                       sender.activeRuleAction !== "always_archive" ? (
                        <button
                          type="button"
                          disabled={actionLoading === sender.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmSender(sender);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 hover:border-red-300 disabled:opacity-50"
                        >
                          {actionLoading === sender.id ? (
                            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z" />
                            </svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
                            </svg>
                          )}
                          Unsub &amp; archive
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmSender}
        title="Unsubscribe & archive this sender?"
        description={
          confirmSender
            ? `We'll attempt to unsubscribe you from ${confirmSender.senderName ?? confirmSender.senderEmail} and automatically archive all future emails. The sender-side unsubscribe may not be fully reversible.`
            : ""
        }
        confirmLabel="Unsubscribe & archive"
        danger
        loading={!!actionLoading}
        onConfirm={() => {
          if (confirmSender) void handleUnsubscribeArchive(confirmSender);
        }}
        onCancel={() => setConfirmSender(null)}
      />
    </div>
  );
}
