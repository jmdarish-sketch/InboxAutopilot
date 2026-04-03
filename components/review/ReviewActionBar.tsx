"use client";

import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewAction =
  | "keep"
  | "archive"
  | "always_keep"
  | "always_archive"
  | "unsubscribe";

interface ReviewActionBarProps {
  onAction:          (action: ReviewAction) => void | Promise<void>;
  loading:           boolean;
  hasUnsubscribe:    boolean;
  /** If true, show a compact layout (e.g. inside a card list) */
  compact?:          boolean;
}

// ---------------------------------------------------------------------------
// Chevron icon
// ---------------------------------------------------------------------------

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReviewActionBar({
  onAction,
  loading,
  hasUnsubscribe,
  compact = false,
}: ReviewActionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handle(action: ReviewAction) {
    setMenuOpen(false);
    await onAction(action);
  }

  const btnBase = compact
    ? "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
    : "rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50";

  const secondaryItems: { label: string; action: ReviewAction; danger?: boolean }[] = [
    { label: "Always keep sender",    action: "always_keep"    },
    { label: "Always archive sender", action: "always_archive", danger: true },
    ...(hasUnsubscribe
      ? [{ label: "Unsubscribe", action: "unsubscribe" as ReviewAction, danger: true }]
      : []),
  ];

  return (
    <div className={`flex items-center gap-2 ${compact ? "flex-wrap" : ""}`}>
      {/* Primary: Keep */}
      <button
        type="button"
        onClick={() => handle("keep")}
        disabled={loading}
        className={`${btnBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
      >
        Keep in inbox
      </button>

      {/* Primary: Archive */}
      <button
        type="button"
        onClick={() => handle("archive")}
        disabled={loading}
        className={`${btnBase} bg-gray-900 text-white hover:bg-gray-700`}
      >
        Archive
      </button>

      {/* Secondary dropdown: "More" */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          disabled={loading}
          className={`${btnBase} flex items-center gap-1.5 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50`}
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          More
          <ChevronIcon open={menuOpen} />
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg ring-1 ring-gray-100">
            {secondaryItems.map(item => (
              <button
                key={item.action}
                type="button"
                onClick={() => handle(item.action)}
                className={`flex w-full items-center px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50 ${
                  item.danger ? "text-red-600" : "text-gray-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
