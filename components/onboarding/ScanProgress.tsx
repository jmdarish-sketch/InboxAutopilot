"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ScanProgress as ScanProgressData } from "@/app/api/scan/start/route";

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useAnimatedCount(target: number): number {
  const [display, setDisplay]   = useState(0);
  const rafRef                  = useRef<number | null>(null);
  const startRef                = useRef({ from: 0, to: 0, startTime: 0 });
  const DURATION                = 400;

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = { from: display, to: target, startTime: performance.now() };

    function tick() {
      const elapsed  = performance.now() - startRef.current.startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = Math.round(
        startRef.current.from + (startRef.current.to - startRef.current.from) * eased
      );
      setDisplay(current);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label:   string;
  value:   number;
  active:  boolean;
  variant: "neutral" | "clutter" | "protected";
}

function StatCard({ label, value, active, variant }: StatCardProps) {
  const displayed = useAnimatedCount(value);

  const variantStyles = {
    neutral:   "border-gray-100 bg-white",
    clutter:   "border-amber-100 bg-amber-50",
    protected: "border-green-100 bg-green-50",
  };
  const valueStyles = {
    neutral:   "text-gray-900",
    clutter:   "text-amber-700",
    protected: "text-green-700",
  };

  return (
    <div
      className={`
        relative flex flex-col gap-1 rounded-2xl border p-5
        transition-all duration-300
        ${variantStyles[variant]}
        ${active ? "shadow-sm" : "opacity-60"}
      `}
    >
      {active && (
        <span className="absolute right-4 top-4 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
      )}
      <span className={`text-3xl font-bold tabular-nums tracking-tight ${valueStyles[variant]}`}>
        {displayed.toLocaleString()}
      </span>
      <span className="text-sm font-medium text-gray-500">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage indicator
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ScanProgressData["stage"], string> = {
  listing:    "Listing",
  processing: "Analyzing",
  finalizing: "Saving",
  complete:   "Complete",
  error:      "Error",
};

const STAGE_ORDER: ScanProgressData["stage"][] = [
  "listing", "processing", "finalizing", "complete",
];

function StageIndicator({ current }: { current: ScanProgressData["stage"] }) {
  const idx = STAGE_ORDER.indexOf(current);
  return (
    <ol className="flex items-center gap-3">
      {STAGE_ORDER.filter((s) => s !== "complete").map((stage, i) => {
        const done    = i < idx;
        const active  = i === idx || (current === "complete" && i === STAGE_ORDER.length - 2);
        return (
          <li key={stage} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-4 bg-gray-200" />}
            <span
              className={`
                flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold
                ${done || current === "complete"
                  ? "bg-blue-500 text-white"
                  : active ? "border-2 border-blue-500 text-blue-600"
                  : "border-2 border-gray-200 text-gray-400"}
              `}
            >
              {done || current === "complete" ? (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                active || current === "complete" ? "text-gray-900" : done ? "text-blue-500" : "text-gray-400"
              }`}
            >
              {STAGE_LABELS[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Main component — polls POST /api/scan/start
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 1500; // ms between polls

export default function ScanProgress() {
  const router = useRouter();

  const [stats, setStats] = useState<ScanProgressData>({
    stage:            "listing",
    emailsScanned:    0,
    emailsTotal:      0,
    sendersFound:     0,
    clutterDetected:  0,
    protectedSenders: 0,
    message:          "Connecting to Gmail…",
  });

  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const pollingRef                  = useRef(false);
  const cancelledRef                = useRef(false);

  const poll = useCallback(async () => {
    if (pollingRef.current || cancelledRef.current) return;
    pollingRef.current = true;

    try {
      const res = await fetch("/api/scan/start", { method: "POST" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const progress = (await res.json()) as ScanProgressData;
      setStats(progress);
      setRetryCount(0); // reset on success

      if (progress.stage === "error") {
        setErrorMsg(progress.message);
        return;
      }

      if (progress.stage === "complete") {
        // Done — don't poll again
        return;
      }

      // Schedule next poll
      if (!cancelledRef.current) {
        setTimeout(() => {
          pollingRef.current = false;
          void poll();
        }, POLL_INTERVAL);
      }
    } catch (err) {
      // Retry up to 3 times on transient errors
      if (retryCount < 3) {
        setRetryCount(c => c + 1);
        setTimeout(() => {
          pollingRef.current = false;
          void poll();
        }, 2000 * (retryCount + 1));
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Connection lost. Please refresh.");
      }
    } finally {
      pollingRef.current = false;
    }
  }, [retryCount]);

  useEffect(() => {
    cancelledRef.current = false;
    void poll();
    return () => { cancelledRef.current = true; };
  }, [poll]);

  const pct = stats.emailsTotal > 0
    ? Math.round((stats.emailsScanned / stats.emailsTotal) * 100)
    : stats.stage === "listing" ? 5 : 100;

  const isComplete = stats.stage === "complete";
  const isActive   = (stat: keyof ScanProgressData) =>
    !isComplete && stats[stat] !== 0;

  if (errorMsg) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Scan failed</h2>
          <p className="mb-6 text-sm text-gray-500">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {isComplete ? "Your inbox is ready." : "Scanning your inbox…"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{stats.message}</p>
        </div>

        {/* Progress bar + stage indicator */}
        <div className="mb-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <StageIndicator current={stats.stage} />
            <span className="text-sm font-semibold tabular-nums text-blue-600">
              {isComplete ? "100%" : `${pct}%`}
            </span>
          </div>
          <ProgressBar pct={isComplete ? 100 : pct} />
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-2 gap-3">
          <StatCard
            label="Emails scanned"
            value={stats.emailsScanned}
            active={isActive("emailsScanned")}
            variant="neutral"
          />
          <StatCard
            label="Senders found"
            value={stats.sendersFound}
            active={isActive("sendersFound")}
            variant="neutral"
          />
          <StatCard
            label="Clutter detected"
            value={stats.clutterDetected}
            active={isActive("clutterDetected")}
            variant="clutter"
          />
          <StatCard
            label="Protected senders"
            value={stats.protectedSenders}
            active={isActive("protectedSenders")}
            variant="protected"
          />
        </div>

        {/* CTA */}
        {isComplete ? (
          <button
            onClick={() => router.push("/onboarding/diagnosis")}
            className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Review suggestions →
          </button>
        ) : (
          <p className="text-center text-xs text-gray-400">
            This usually takes 1–3 minutes. Keep this tab open.
          </p>
        )}
      </div>
    </div>
  );
}
