"use client";

import PageError from "@/components/shared/PageError";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load your dashboard." reset={reset} />;
}
