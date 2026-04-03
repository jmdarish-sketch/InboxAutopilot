"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SenderDetail } from "@/lib/senders/queries";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/ToastProvider";

type RuleAction =
  | "always_keep"
  | "always_archive"
  | "digest_only"
  | "always_review"
  | "try_unsubscribe"
  | "reset";

interface SenderControlPanelProps {
  sender: SenderDetail;
}

interface ActionConfig {
  action:       RuleAction;
  label:        string;
  description:  string;
  variant:      "default" | "danger" | "subtle";
  icon:         React.ReactNode;
}

const KEEP_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const ARCHIVE_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
  </svg>
);

const DIGEST_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
  </svg>
);

const REVIEW_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
  </svg>
);

const UNSUB_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
  </svg>
);

const RESET_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

const ACTIONS: ActionConfig[] = [
  {
    action:      "always_keep",
    label:       "Always keep",
    description: "Always deliver to inbox. Never archive.",
    variant:     "default",
    icon:        KEEP_ICON,
  },
  {
    action:      "always_archive",
    label:       "Always archive",
    description: "Skip the inbox. Archive automatically.",
    variant:     "default",
    icon:        ARCHIVE_ICON,
  },
  {
    action:      "digest_only",
    label:       "Digest only",
    description: "Summarize in daily digest. Skip inbox.",
    variant:     "default",
    icon:        DIGEST_ICON,
  },
  {
    action:      "always_review",
    label:       "Always review",
    description: "Send to review queue for manual triage.",
    variant:     "default",
    icon:        REVIEW_ICON,
  },
  {
    action:      "try_unsubscribe",
    label:       "Try unsubscribe",
    description: "Attempt unsubscribe and archive future emails.",
    variant:     "danger",
    icon:        UNSUB_ICON,
  },
  {
    action:      "reset",
    label:       "Reset learned behavior",
    description: "Clear all rules and return to auto-learning.",
    variant:     "subtle",
    icon:        RESET_ICON,
  },
];

const VARIANT_CLASSES: Record<ActionConfig["variant"], string> = {
  default: "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300",
  danger:  "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300",
  subtle:  "border border-dashed border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
};

const NEEDS_CONFIRM: RuleAction[] = ["always_archive", "try_unsubscribe"];

const CONFIRM_MAP: Record<string, { title: string; desc: (name: string) => string; label: string }> = {
  always_archive: {
    title: "Always archive this sender?",
    desc:  (name) => `All future emails from ${name} will be automatically archived. You can undo this later.`,
    label: "Always archive",
  },
  try_unsubscribe: {
    title: "Unsubscribe from this sender?",
    desc:  (name) => `We'll attempt to unsubscribe you from ${name}. The sender-side unsubscribe may not be fully reversible.`,
    label: "Unsubscribe",
  },
};

const ACTION_TOAST: Record<string, string> = {
  always_keep:      "Sender marked as always keep",
  always_archive:   "Sender set to always archive",
  digest_only:      "Sender set to digest only",
  always_review:    "Sender set to always review",
  try_unsubscribe:  "Unsubscribe attempted",
  reset:            "Learned behavior reset",
};

export default function SenderControlPanel({ sender }: SenderControlPanelProps) {
  const router  = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<RuleAction | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<RuleAction | null>(null);

  const currentAction = sender.activeRuleAction;
  const senderLabel   = sender.senderName ?? sender.senderEmail ?? "this sender";

  async function executeAction(action: RuleAction) {
    if (loading) return;
    setLoading(action);
    setError(null);

    try {
      const res = await fetch(`/api/senders/${sender.id}/rule`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }

      toast(ACTION_TOAST[action] ?? "Rule updated", "success");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(null);
    }
  }

  function handleAction(action: RuleAction) {
    if (NEEDS_CONFIRM.includes(action)) {
      setPendingConfirm(action);
    } else {
      void executeAction(action);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {ACTIONS.map(cfg => {
        const isActive  = currentAction === cfg.action;
        const isLoading = loading === cfg.action;

        return (
          <button
            key={cfg.action}
            type="button"
            onClick={() => { handleAction(cfg.action); }}
            disabled={!!loading}
            className={`
              flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left text-sm
              transition-all disabled:opacity-50
              ${isActive
                ? "border border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-200"
                : VARIANT_CLASSES[cfg.variant]
              }
            `}
          >
            <span className="mt-0.5 flex-shrink-0">
              {isLoading ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              ) : cfg.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium">
                {cfg.label}
                {isActive && (
                  <span className="ml-2 text-xs font-normal text-blue-600">(active)</span>
                )}
              </p>
              <p className="mt-0.5 text-xs opacity-70">{cfg.description}</p>
            </div>
          </button>
        );
      })}

      {/* Confirm dialog for destructive actions */}
      {pendingConfirm && CONFIRM_MAP[pendingConfirm] && (
        <ConfirmDialog
          open={true}
          title={CONFIRM_MAP[pendingConfirm].title}
          description={CONFIRM_MAP[pendingConfirm].desc(senderLabel)}
          confirmLabel={CONFIRM_MAP[pendingConfirm].label}
          danger
          loading={!!loading}
          onConfirm={() => {
            const action = pendingConfirm;
            setPendingConfirm(null);
            void executeAction(action);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
