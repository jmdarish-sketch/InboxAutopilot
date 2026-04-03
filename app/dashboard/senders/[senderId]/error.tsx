"use client";

import PageError from "@/components/shared/PageError";

export default function SenderDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load sender details." reset={reset} />;
}
