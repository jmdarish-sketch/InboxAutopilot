"use client";

// ---------------------------------------------------------------------------
// PageError — reusable error state for error.tsx boundaries.
// ---------------------------------------------------------------------------

interface PageErrorProps {
  message?: string;
  reset:    () => void;
}

export default function PageError({
  message = "Something went wrong loading this page.",
  reset,
}: PageErrorProps) {
  return (
    <div className="min-h-full pb-16 pt-10">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Failed to load</h2>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Retry
        </button>
      </div>
    </div>
  );
}
