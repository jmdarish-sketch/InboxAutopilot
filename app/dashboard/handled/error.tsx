"use client";

import PageError from "@/components/shared/PageError";

export default function HandledError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load handled actions." reset={reset} />;
}
