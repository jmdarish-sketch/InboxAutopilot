"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shared/ToastProvider";

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

type AutopilotMode = "suggest_only" | "safe" | "aggressive";

interface ModeConfig {
  id:          AutopilotMode;
  title:       string;
  description: string;
  bullets:     string[];
  risk:        string;
  riskColor:   "gray" | "green" | "amber";
  recommended?: boolean;
}

const MODES: ModeConfig[] = [
  {
    id:          "suggest_only",
    title:       "Suggest Only",
    description: "Nothing happens automatically. We suggest actions for you to review and approve.",
    bullets: [
      "Every action requires your approval",
      "Full control — nothing moves without you",
      "Best for getting familiar with the system",
    ],
    risk:      "No automation",
    riskColor: "gray",
  },
  {
    id:          "safe",
    title:       "Safe Autopilot",
    description: "Automatically archives high-confidence clutter. Borderline cases come to your review queue.",
    bullets: [
      "Auto-archives obvious promotions and newsletters",
      "Uncertain emails land in your review queue",
      "Important senders are always protected",
    ],
    risk:        "Low risk",
    riskColor:   "green",
    recommended: true,
  },
  {
    id:          "aggressive",
    title:       "Aggressive Autopilot",
    description: "Handles most low-value email automatically while still protecting important categories.",
    bullets: [
      "Archives broadly with a lower confidence threshold",
      "Financial, security, and personal emails stay protected",
      "Fewer items in review queue, more automation",
    ],
    risk:      "Medium risk",
    riskColor: "amber",
  },
];

// ---------------------------------------------------------------------------
// Risk pill
// ---------------------------------------------------------------------------

function RiskPill({ label, color }: { label: string; color: "gray" | "green" | "amber" }) {
  const styles = {
    gray:  "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[color]}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mode card
// ---------------------------------------------------------------------------

interface ModeCardProps {
  mode:     ModeConfig;
  selected: boolean;
  onSelect: () => void;
}

function ModeCard({ mode, selected, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative flex flex-col rounded-2xl border-2 p-6 text-left transition-all
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600
        ${selected
          ? "border-blue-600 bg-blue-50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300"}
      `}
    >
      {/* Recommended badge */}
      {mode.recommended && (
        <span className="absolute right-4 top-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
          Recommended
        </span>
      )}

      {/* Radio indicator */}
      <span
        className={`
          mb-4 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors
          ${selected ? "border-blue-600" : "border-gray-300"}
        `}
      >
        {selected && (
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
        )}
      </span>

      {/* Title */}
      <h3 className="text-base font-semibold text-gray-900">{mode.title}</h3>

      {/* Description */}
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{mode.description}</p>

      {/* Bullets */}
      <ul className="mt-4 space-y-2">
        {mode.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3 8l3.5 3.5L13 4"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {b}
          </li>
        ))}
      </ul>

      {/* Risk level */}
      <div className="mt-5 flex items-center justify-between">
        <RiskPill label={mode.risk} color={mode.riskColor} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AutopilotModeSelector() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const [selected, setSelected] = useState<AutopilotMode>("safe");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/set-autopilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: selected }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save");
      }

      toast("Autopilot enabled", "success");
      startTransition(() => {
        router.push("/onboarding/complete");
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      toast(msg, "error");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 pt-12">
      <div className="mx-auto max-w-4xl px-4">

        {/* Header */}
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Choose your autopilot level</h1>
          <p className="mt-2 text-base text-gray-500">You can change this at any time from settings.</p>
        </header>

        {/* Mode cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MODES.map(mode => (
            <ModeCard
              key={mode.id}
              mode={mode}
              selected={selected === mode.id}
              onSelect={() => setSelected(mode.id)}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </>
            ) : (
              "Turn On Autopilot"
            )}
          </button>
          <p className="text-xs text-gray-400">
            You can adjust or pause autopilot from your dashboard settings.
          </p>
        </div>

      </div>
    </div>
  );
}
