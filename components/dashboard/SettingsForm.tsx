"use client";

import { useState, useTransition } from "react";
import { useRouter }                from "next/navigation";
import type { UserSettings, UserPreferences } from "@/app/api/settings/route";
import SharedConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SaveIndicator({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) {
    return (
      <span className="text-xs text-gray-400">Saving…</span>
    );
  }
  if (saved) {
    return (
      <span className="text-xs text-green-600">Saved</span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title:       string;
  description?: string;
  children:    React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="border-b border-gray-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        )}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle row
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label:        string;
  description?: string;
  checked:      boolean;
  onChange:     (v: boolean) => void;
  disabled?:    boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 ${
          checked ? "bg-gray-900" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkbox row
// ---------------------------------------------------------------------------

function CheckboxRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id:           string;
  label:        string;
  description?: string;
  checked:      boolean;
  onChange:     (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
      />
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && (
          <p className="text-xs text-gray-400">{description}</p>
        )}
      </div>
    </label>
  );
}

// ConfirmDialog is now imported from shared/ConfirmDialog as SharedConfirmDialog

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SettingsFormProps {
  initial: UserSettings;
}

export default function SettingsForm({ initial }: SettingsFormProps) {
  const router     = useRouter();
  const [, startTransition] = useTransition();
  const { toast }  = useToast();

  const [settings, setSettings] = useState<UserSettings>(initial);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  // Destructive action states
  const [confirmDialog, setConfirmDialog] = useState<
    | { type: "delete_email_data" }
    | { type: "delete_account" }
    | { type: "disconnect" }
    | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Save helper ────────────────────────────────────────────────────────────

  async function save(patch: Partial<{ autopilotMode: string; preferences: Partial<UserPreferences> }>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  // ── Updaters ───────────────────────────────────────────────────────────────

  function setMode(mode: UserSettings["autopilotMode"]) {
    setSettings(s => ({ ...s, autopilotMode: mode }));
    void save({ autopilotMode: mode });
  }

  function setPref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setSettings(s => ({
      ...s,
      preferences: { ...s.preferences, [key]: value },
    }));
    void save({ preferences: { [key]: value } });
  }

  function setProtectedCategory(
    key: keyof UserPreferences["protectedCategories"],
    value: boolean
  ) {
    const next = { ...settings.preferences.protectedCategories, [key]: value };
    setSettings(s => ({
      ...s,
      preferences: { ...s.preferences, protectedCategories: next },
    }));
    void save({ preferences: { protectedCategories: next } });
  }

  // ── Destructive actions ────────────────────────────────────────────────────

  async function handleDestructive(action: "delete_email_data" | "delete_account") {
    setConfirmDialog(null);
    setActionError(null);
    try {
      const res = await fetch("/api/settings", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed");
      if (action === "delete_account") {
        toast("Account deleted", "success");
        startTransition(() => router.push("/"));
      } else {
        toast("Email data deleted", "success");
        startTransition(() => router.refresh());
      }
    } catch {
      const msg = action === "delete_account"
        ? "Could not delete account. Try again."
        : "Could not delete email data. Try again.";
      setActionError(msg);
      toast(msg, "error");
    }
  }

  async function handleExport() {
    // Export is a simple GET that browsers can follow
    window.location.href = "/api/settings/export";
  }

  async function handleDisconnect() {
    setConfirmDialog(null);
    setActionError(null);
    try {
      const res = await fetch("/api/gmail/oauth/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast("Gmail disconnected", "success");
      startTransition(() => router.push("/connect-gmail"));
    } catch {
      const msg = "Could not disconnect Gmail. Try again.";
      setActionError(msg);
      toast(msg, "error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const { preferences } = settings;

  return (
    <>
      <div className="flex flex-col gap-6">

        {/* Save indicator */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Changes save automatically.</p>
          <SaveIndicator saving={saving} saved={saved} />
        </div>

        {/* ── Autopilot controls ──────────────────────────────────────────── */}
        <Section
          title="Autopilot controls"
          description="Control how aggressively autopilot handles your inbox."
        >
          {/* Mode selector */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Mode</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    value:       "suggest_only" as const,
                    label:       "Suggest only",
                    description: "No automatic actions. You review every recommendation.",
                    recommended: false,
                  },
                  {
                    value:       "safe" as const,
                    label:       "Safe autopilot",
                    description: "Archives high-confidence clutter. Borderline items go to review.",
                    recommended: true,
                  },
                  {
                    value:       "aggressive" as const,
                    label:       "Aggressive autopilot",
                    description: "Handles more automatically. Still protects important categories.",
                    recommended: false,
                  },
                ] as const
              ).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
                    settings.autopilotMode === opt.value
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  }`}
                >
                  {opt.recommended && (
                    <span className="mb-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Recommended
                    </span>
                  )}
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="mt-1 text-xs text-gray-400">{opt.description}</p>
                  {settings.autopilotMode === opt.value && (
                    <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900">
                      <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10.28 2.28 3.989 8.575 1.695 6.28A1 1 0 0 0 .28 7.695l3 3a1 1 0 0 0 1.414 0l7-7A1 1 0 0 0 10.28 2.28Z" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Action toggles */}
          <div className="space-y-4 pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Actions</p>
            <ToggleRow
              label="Auto-archive"
              description="Automatically archive high-confidence clutter without review."
              checked={preferences.autoArchiveEnabled}
              onChange={v => setPref("autoArchiveEnabled", v)}
            />
            <ToggleRow
              label="Auto-unsubscribe"
              description="Automatically attempt to unsubscribe from low-value recurring senders."
              checked={preferences.autoUnsubscribeEnabled}
              onChange={v => setPref("autoUnsubscribeEnabled", v)}
            />
            <ToggleRow
              label="Review queue"
              description="Collect borderline emails for your decision before autopilot acts."
              checked={preferences.reviewQueueEnabled}
              onChange={v => setPref("reviewQueueEnabled", v)}
            />
          </div>
        </Section>

        {/* ── Protected categories ────────────────────────────────────────── */}
        <Section
          title="Protected categories"
          description="Autopilot will never automatically archive emails in these categories."
        >
          <div className="space-y-3">
            <CheckboxRow
              id="cat-finance"
              label="Finance"
              description="Billing statements, invoices, bank alerts, receipts."
              checked={preferences.protectedCategories.finance}
              onChange={v => setProtectedCategory("finance", v)}
            />
            <CheckboxRow
              id="cat-travel"
              label="Travel"
              description="Flight confirmations, hotel bookings, trip logistics."
              checked={preferences.protectedCategories.travel}
              onChange={v => setProtectedCategory("travel", v)}
            />
            <CheckboxRow
              id="cat-security"
              label="Security"
              description="Password resets, 2FA codes, login alerts."
              checked={preferences.protectedCategories.security}
              onChange={v => setProtectedCategory("security", v)}
            />
            <CheckboxRow
              id="cat-school-work"
              label="School / Work"
              description="Emails from school or work domains, assignments, deadlines."
              checked={preferences.protectedCategories.schoolWork}
              onChange={v => setProtectedCategory("schoolWork", v)}
            />
            <CheckboxRow
              id="cat-personal"
              label="Personal contacts"
              description="Emails that look like genuine messages from real people."
              checked={preferences.protectedCategories.personalContacts}
              onChange={v => setProtectedCategory("personalContacts", v)}
            />
            <CheckboxRow
              id="cat-receipts"
              label="Receipts / Order confirmations"
              description="Shipping updates, order summaries, purchase confirmations."
              checked={preferences.protectedCategories.receiptsOrders}
              onChange={v => setProtectedCategory("receiptsOrders", v)}
            />
          </div>
        </Section>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <Section
          title="Notifications"
          description="How you want to hear about what autopilot handled."
        >
          <div className="space-y-3">
            {(
              [
                { value: "none"           as const, label: "None",                          description: "No notifications." },
                { value: "daily_digest"   as const, label: "Daily digest",                  description: "A summary of everything handled, once per day." },
                { value: "important_only" as const, label: "Immediate — important only",    description: "Instant alert when autopilot surfaces an important email." },
                { value: "weekly_summary" as const, label: "Weekly summary",                description: "One email per week with what was handled." },
              ] as const
            ).map(opt => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-start gap-3"
              >
                <input
                  type="radio"
                  name="notifications"
                  value={opt.value}
                  checked={preferences.notifications === opt.value}
                  onChange={() => setPref("notifications", opt.value)}
                  className="mt-0.5 h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <Section title="Account">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Connected Gmail</p>
              <p className="mt-0.5 text-sm text-gray-400">
                {settings.connectedGmailEmail ?? "No Gmail account connected"}
              </p>
            </div>
            {settings.connectedGmailEmail && (
              <button
                type="button"
                onClick={() => setConfirmDialog({ type: "disconnect" })}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Disconnect
              </button>
            )}
          </div>
        </Section>

        {/* ── Privacy / data ──────────────────────────────────────────────── */}
        <Section
          title="Privacy / data"
          description="Manage the data stored in your account."
        >
          {actionError && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
              {actionError}
            </p>
          )}

          <div className="space-y-3">
            {/* Export */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Export your data</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Download a JSON file of your preferences and actions log.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Export
              </button>
            </div>

            {/* Delete email data */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete synced email data</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Removes all messages, senders, and actions we've stored. Your Gmail is unaffected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDialog({ type: "delete_email_data" })}
                className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Delete data
              </button>
            </div>

            {/* Delete account */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete account</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Permanently removes your account and all associated data. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDialog({ type: "delete_account" })}
                className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Delete account
              </button>
            </div>
          </div>
        </Section>

      </div>

      {/* ── Confirm dialogs ──────────────────────────────────────────────── */}
      <SharedConfirmDialog
        open={confirmDialog?.type === "disconnect"}
        title="Disconnect Gmail?"
        description="Your autopilot will stop working. Your Gmail account won't be affected."
        confirmLabel="Disconnect"
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDialog(null)}
      />
      <SharedConfirmDialog
        open={confirmDialog?.type === "delete_email_data"}
        title="Delete synced email data?"
        description="This removes all messages, senders, and actions we've stored locally. Your Gmail inbox won't be changed."
        confirmLabel="Delete data"
        onConfirm={() => void handleDestructive("delete_email_data")}
        onCancel={() => setConfirmDialog(null)}
        danger
      />
      <SharedConfirmDialog
        open={confirmDialog?.type === "delete_account"}
        title="Delete your account?"
        description="This permanently removes your account and all data. You can reconnect Gmail and start over at any time."
        confirmLabel="Delete account"
        onConfirm={() => void handleDestructive("delete_account")}
        onCancel={() => setConfirmDialog(null)}
        danger
      />
    </>
  );
}
