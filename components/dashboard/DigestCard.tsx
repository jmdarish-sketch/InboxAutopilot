"use client";

// ---------------------------------------------------------------------------
// DigestCard — a single section within the digest view.
// Calm, concise, operational. No marketing language.
// ---------------------------------------------------------------------------

interface DigestCardProps {
  title:    string;
  count?:   number;
  children: React.ReactNode;
  empty?:   string; // shown when children would be empty
}

export default function DigestCard({
  title,
  count,
  children,
  empty,
}: DigestCardProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {count}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {empty ? (
          <p className="text-sm text-gray-400">{empty}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DigestStatRow — key-value pair inside a DigestCard
// ---------------------------------------------------------------------------

export function DigestStatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DigestListRow — single entry in a list section
// ---------------------------------------------------------------------------

export function DigestListRow({
  primary,
  secondary,
  meta,
}: {
  primary:    string;
  secondary?: string;
  meta?:      string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{primary}</p>
        {secondary && (
          <p className="mt-0.5 truncate text-xs text-gray-400">{secondary}</p>
        )}
      </div>
      {meta && (
        <span className="shrink-0 text-xs text-gray-400">{meta}</span>
      )}
    </div>
  );
}
