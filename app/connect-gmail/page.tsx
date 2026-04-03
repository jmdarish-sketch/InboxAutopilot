import { currentUser } from "@clerk/nextjs/server";

const PERMISSION_ITEMS = [
  {
    label: "Read your emails",
    detail: "So we can analyze and categorize what's in your inbox.",
  },
  {
    label: "Modify labels",
    detail: "So we can organize, archive, and label messages on your behalf.",
  },
  {
    label: "Archive messages",
    detail: "So we can move clutter out of your inbox — reversibly.",
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined Gmail access. You can try again whenever you're ready.",
  state_mismatch: "Something went wrong with the request. Please try again.",
  no_refresh_token: "Google didn't return a refresh token. Please try again.",
  db_error: "We couldn't save your connection. Please try again.",
  unexpected: "An unexpected error occurred. Please try again.",
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function ConnectGmailPage({ searchParams }: Props) {
  const user = await currentUser();
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unexpected) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Connect your Gmail
          </h1>
          {user?.firstName && (
            <p className="mt-1 text-sm text-gray-500">
              Hey {user.firstName} — one step and the autopilot is ready to go.
            </p>
          )}
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {errorMessage}
          </div>
        )}

        {/* Permissions */}
        <div className="mb-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Inbox Autopilot will be able to
          </p>
          {PERMISSION_ITEMS.map(({ label, detail }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-3 w-3 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Never section */}
        <div className="mb-6 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500 ring-1 ring-gray-100">
          <span className="font-medium text-gray-700">We will never</span>{" "}
          send email on your behalf, access contacts, or delete messages
          permanently. All actions are reversible.
        </div>

        {/* CTA */}
        <a
          href="/api/gmail/oauth/start"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#fff"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#fff"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#fff"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#fff"
            />
          </svg>
          Continue with Gmail
        </a>

        <p className="mt-4 text-center text-xs text-gray-400">
          You can disconnect at any time from your account settings.
        </p>
      </div>
    </div>
  );
}
