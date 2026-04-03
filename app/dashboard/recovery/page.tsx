import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect }          from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import RecoveryTable         from "@/components/dashboard/RecoveryTable";
import type { RecoveryItem, RecoveryActionType } from "@/app/api/recovery/list/route";

export const dynamic = "force-dynamic";

async function getRecoveryItems(supabaseUserId: string): Promise<RecoveryItem[]> {
  const supabase = createAdminClient();

  type ActionRow = {
    id: string;
    action_type: string;
    action_source: string;
    reason: string | null;
    reversible: boolean;
    undone: boolean;
    undone_at: string | null;
    created_at: string;
    sender_id: string | null;
    gmail_message_id: string | null;
    metadata: Record<string, unknown>;
  };

  const { data: actions } = await supabase
    .from("actions_log")
    .select(
      "id, action_type, action_source, reason, reversible, undone, undone_at, " +
      "created_at, sender_id, gmail_message_id, metadata"
    )
    .eq("user_id", supabaseUserId)
    .order("created_at", { ascending: false })
    .limit(150) as unknown as { data: ActionRow[] | null };

  if (!actions?.length) return [];

  const senderIds = [...new Set(actions.map(a => a.sender_id).filter(Boolean))] as string[];

  type SenderRow = { id: string; sender_email: string; sender_name: string | null };

  const { data: senders } = await supabase
    .from("senders")
    .select("id, sender_email, sender_name")
    .in("id", senderIds) as unknown as { data: SenderRow[] | null };

  const senderMap = new Map<string, SenderRow>();
  for (const s of senders ?? []) senderMap.set(s.id, s);

  return actions.map(a => {
    const sender = a.sender_id ? senderMap.get(a.sender_id) : undefined;
    return {
      id:             a.id,
      actionType:     a.action_type as RecoveryActionType,
      actionSource:   a.action_source,
      reason:         a.reason,
      reversible:     a.reversible,
      undone:         a.undone,
      undoneAt:       a.undone_at,
      createdAt:      a.created_at,
      senderId:       a.sender_id,
      senderEmail:    sender?.sender_email ?? null,
      senderName:     sender?.sender_name  ?? null,
      gmailMessageId: a.gmail_message_id,
      metadata:       a.metadata ?? {},
    };
  });
}

export default async function RecoveryPage() {
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

  if (!user) redirect("/sign-in");

  const items = await getRecoveryItems(user.id as string);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Recovery</h1>
        <p className="mt-1 text-sm text-gray-500">
          Undo anything autopilot handled. Every action is reversible by default.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Total actions",
            value: items.length,
          },
          {
            label: "Archived",
            value: items.filter(i => i.actionType === "archive").length,
          },
          {
            label: "Unsubscribed",
            value: items.filter(i => i.actionType === "unsubscribe").length,
          },
          {
            label: "Undone",
            value: items.filter(i => i.undone).length,
          },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-2xl border border-gray-100 bg-white px-5 py-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <RecoveryTable initialItems={items} />
    </div>
  );
}
