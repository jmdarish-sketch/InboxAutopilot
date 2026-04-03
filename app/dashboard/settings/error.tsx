"use client";

import PageError from "@/components/shared/PageError";

export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageError message="Could not load settings." reset={reset} />;
}
