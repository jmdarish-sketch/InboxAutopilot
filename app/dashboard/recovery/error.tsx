"use client";

import PageError from "@/components/shared/PageError";

export default function RecoveryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load the recovery center." reset={reset} />;
}
