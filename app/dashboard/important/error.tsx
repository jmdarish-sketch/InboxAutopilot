"use client";

import PageError from "@/components/shared/PageError";

export default function ImportantError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load important messages." reset={reset} />;
}
