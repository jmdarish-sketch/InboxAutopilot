"use client";

import PageError from "@/components/shared/PageError";

export default function CleanupError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load cleanup recommendations." reset={reset} />;
}
