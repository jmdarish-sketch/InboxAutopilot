"use client";

import PageError from "@/components/shared/PageError";

export default function DigestError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load the digest." reset={reset} />;
}
