"use client";

import PageError from "@/components/shared/PageError";

export default function DiagnosisError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load your inbox diagnosis." reset={reset} />;
}
