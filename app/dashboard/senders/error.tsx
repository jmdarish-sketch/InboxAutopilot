"use client";

import PageError from "@/components/shared/PageError";

export default function SendersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load senders." reset={reset} />;
}
