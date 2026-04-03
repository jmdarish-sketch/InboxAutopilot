"use client";

import PageError from "@/components/shared/PageError";

export default function ReviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load the review queue." reset={reset} />;
}
