import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const IMPORTANT_CATEGORIES = [
  "critical_transactional",
  "personal_human",
  "work_school",
  "recurring_useful",
];

const CATEGORY_REASONS: Record<string, string> = {
  critical_transactional: "Contains transactional or security language",
  personal_human:         "Looks like a genuine personal email",
  work_school:            "Detected work or school sender",
  recurring_useful:       "You regularly engage with this sender",
};

const CATEGORY_BADGES: Record<string, { label: string; cls: string }> = {
  critical_transactional: { label: "Transactional", cls: "bg-red-50 text-red-700" },
  personal_human:         { label: "Personal",      cls: "bg-blue-50 text-blue-700" },
  work_school:            { label: "Work / School", cls: "bg-purple-50 text-purple-700" },
  recurring_useful:       { label: "Useful",        cls: "bg-green-50 text-green-700" },
};

interface ImportantItem {
  id:             string;
  gmail_thread_id: string | null;
  sender_name:    string | null;
  sender_email:   string | null;
  subject:        string | null;
  snippet:        string | null;
  action_reason:  string | null;
  final_category: string | null;
  internal_date:  string | null;
}

async function getData() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) redirect("/sign-in");

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) redirect("/sign-in");

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) redirect("/connect-gmail");

  const supabaseUserId = user.id as string;

  // Fetch important messages with sender info
  const { data: messages } = await supabase
    .from("messages")
    .select("id, gmail_thread_id, subject, snippet, final_category, action_reason, internal_date, sender_id")
    .eq("user_id", supabaseUserId)
    .eq("recommended_action", "keep_inbox")
    .in("final_category", IMPORTANT_CATEGORIES)
    .order("internal_date", { ascending: false })
    .limit(50) as unknown as {
      data: Array<{
        id: string;
        gmail_thread_id: string | null;
        subject: string | null;
        snippet: string | null;
        final_category: string | null;
        action_reason: string | null;
        internal_date: string | null;
        sender_id: string | null;
      }> | null;
    };

  const msgs = messages ?? [];

  // Fetch sender details
  const senderIds = [...new Set(msgs.map(m => m.sender_id).filter((id): id is string => !!id))];
  const senderMap = new Map<string, { sender_name: string | null; sender_email: string }>();

  if (senderIds.length > 0) {
    const { data: senders } = await supabase
      .from("senders")
      .select("id, sender_name, sender_email")
      .in("id", senderIds) as unknown as {
        data: Array<{ id: string; sender_name: string | null; sender_email: string }> | null;
      };
    for (const s of senders ?? []) {
      senderMap.set(s.id, s);
    }
  }

  const items: ImportantItem[] = msgs.map(m => {
    const sender = m.sender_id ? senderMap.get(m.sender_id) : null;
    return {
      id:              m.id,
      gmail_thread_id: m.gmail_thread_id,
      sender_name:     sender?.sender_name ?? null,
      sender_email:    sender?.sender_email ?? null,
      subject:         m.subject,
      snippet:         m.snippet,
      action_reason:   m.action_reason,
      final_category:  m.final_category,
      internal_date:   m.internal_date,
    };
  });

  return items;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ImportantPage() {
  const items = await getData();

  return (
    <div className="min-h-full pb-16 pt-10">
      <div className="mx-auto max-w-4xl space-y-6 px-6">

        {/* Header */}
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Important</h1>
          <p className="mt-1 text-sm text-gray-500">
            Messages your autopilot thinks matter most.
          </p>
        </header>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-gray-500">No important messages detected yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Important emails from personal contacts, financial senders, and work/school will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const reason = item.action_reason
                ? item.action_reason.replace(/_/g, " ")
                : CATEGORY_REASONS[item.final_category ?? ""] ?? "Marked as important";

              const gmailUrl = item.gmail_thread_id
                ? `https://mail.google.com/mail/#inbox/${item.gmail_thread_id}`
                : "https://mail.google.com";

              const initial = (
                item.sender_name?.[0] ?? item.sender_email?.[0] ?? "?"
              ).toUpperCase();

              const badge = CATEGORY_BADGES[item.final_category ?? ""];

              return (
                <div
                  key={item.id}
                  className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                    {initial}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {item.sender_name ?? item.sender_email ?? "Unknown sender"}
                      </p>
                      {badge && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                      {item.internal_date && (
                        <span className="text-xs text-gray-400">
                          {formatRelative(item.internal_date)}
                        </span>
                      )}
                    </div>
                    {item.sender_email && item.sender_name && (
                      <p className="mt-0.5 truncate text-xs text-gray-400">{item.sender_email}</p>
                    )}
                    <p className="mt-1 truncate text-sm text-gray-700">
                      {item.subject ?? "(no subject)"}
                    </p>
                    {item.snippet && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{item.snippet}</p>
                    )}
                    <p className="mt-1.5 text-xs font-medium text-blue-600">{reason}</p>
                  </div>

                  <a
                    href={gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Open
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
