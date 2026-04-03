"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// SyncNowButton — triggers an immediate autopilot run via the user-initiated
// path of /api/jobs/autopilot-run (Clerk session auth, no CRON_SECRET needed).
// ---------------------------------------------------------------------------

export default function SyncNowButton() {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);

    try {
      const res = await fetch("/api/jobs/autopilot-run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Sync failed");
      }

      const result = (await res.json()) as {
        processed?: number;
        archived?:  number;
        queued?:    number;
      };

      const parts: string[] = [];
      if (result.processed) parts.push(`${result.processed} processed`);
      if (result.archived)  parts.push(`${result.archived} archived`);
      if (result.queued)    parts.push(`${result.queued} queued`);

      toast(
        parts.length > 0
          ? `Sync complete: ${parts.join(", ")}`
          : "Sync complete — no new emails",
        "success"
      );

      router.refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Sync failed",
        "error"
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
    >
      {syncing ? (
        <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      )}
      {syncing ? "Syncing…" : "Sync now"}
    </button>
  );
}
