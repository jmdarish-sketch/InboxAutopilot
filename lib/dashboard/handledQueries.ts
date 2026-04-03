import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HandledFilterTab =
  | "today"
  | "7days"
  | "30days"
  | "archive"
  | "unsubscribe"
  | "muted";

export interface HandledActionItem {
  actionId:       string;
  actionType:     string;
  actionSource:   string;
  status:         string;
  reason:         string | null;
  reversible:     boolean;
  undone:         boolean;
  createdAt:      string;
  // sender
  senderId:       string | null;
  senderName:     string | null;
  senderEmail:    string | null;
  // message (null for bulk / sender-level actions)
  messageId:      string | null;
  gmailMessageId: string | null;
  subject:        string | null;
  snippet:        string | null;
  // from metadata
  archivedCount:  number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoUtc(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// fetchHandledActions
//
// Shared by the handled page (full list + filter) and the RecentActionsFeed
// (last N items, no filter).
// ---------------------------------------------------------------------------

export async function fetchHandledActions(
  supabaseUserId: string,
  filter: HandledFilterTab | "all" = "today",
  limit  = 200
): Promise<HandledActionItem[]> {
  const supabase = createAdminClient();

  type ActionRow = {
    id:               string;
    action_type:      string;
    action_source:    string;
    status:           string;
    reason:           string | null;
    reversible:       boolean;
    undone:           boolean;
    created_at:       string;
    sender_id:        string | null;
    message_id:       string | null;
    gmail_message_id: string | null;
    metadata:         Record<string, unknown> | null;
  };

  // Build query
  let q = supabase
    .from("actions_log")
    .select(
      "id, action_type, action_source, status, reason, reversible, undone, " +
      "created_at, sender_id, message_id, gmail_message_id, metadata"
    )
    .eq("user_id", supabaseUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // ── Time-window filters ──────────────────────────────────────────────────
  if (filter === "today")  q = q.gte("created_at", startOfDayUtc());
  if (filter === "7days")  q = q.gte("created_at", daysAgoUtc(7));
  if (filter === "30days") q = q.gte("created_at", daysAgoUtc(30));

  // ── Type filters ─────────────────────────────────────────────────────────
  if (filter === "archive")     q = q.eq("action_type", "archive");
  if (filter === "unsubscribe") q = q.eq("action_type", "unsubscribe");
  if (filter === "muted")       q = q.eq("action_type", "mute");

  const { data: actions } = await q as unknown as { data: ActionRow[] | null };
  if (!actions?.length) return [];

  // ── Parallel enrichment: senders + messages ──────────────────────────────
  const senderIds = [...new Set(
    actions.map(a => a.sender_id).filter((id): id is string => !!id)
  )];
  const messageIds = [...new Set(
    actions.map(a => a.message_id).filter((id): id is string => !!id)
  )];

  type SenderRow  = { id: string; sender_name: string | null; sender_email: string };
  type MessageRow = { id: string; subject: string | null; snippet: string | null };

  const [sendersRes, messagesRes] = await Promise.all([
    senderIds.length > 0
      ? supabase
          .from("senders")
          .select("id, sender_name, sender_email")
          .in("id", senderIds) as unknown as Promise<{ data: SenderRow[] | null }>
      : Promise.resolve({ data: [] as SenderRow[] }),

    messageIds.length > 0
      ? supabase
          .from("messages")
          .select("id, subject, snippet")
          .in("id", messageIds) as unknown as Promise<{ data: MessageRow[] | null }>
      : Promise.resolve({ data: [] as MessageRow[] }),
  ]);

  const senderMap  = new Map((sendersRes.data  ?? []).map(s => [s.id, s]));
  const messageMap = new Map((messagesRes.data ?? []).map(m => [m.id, m]));

  return actions.map(a => {
    const sender  = a.sender_id  ? senderMap.get(a.sender_id)   : undefined;
    const message = a.message_id ? messageMap.get(a.message_id) : undefined;
    const meta    = (a.metadata ?? {}) as Record<string, unknown>;

    return {
      actionId:       a.id,
      actionType:     a.action_type,
      actionSource:   a.action_source,
      status:         a.status,
      reason:         a.reason,
      reversible:     a.reversible,
      undone:         a.undone,
      createdAt:      a.created_at,
      senderId:       a.sender_id,
      senderName:     sender?.sender_name  ?? null,
      senderEmail:    sender?.sender_email ?? null,
      messageId:      a.message_id,
      gmailMessageId: a.gmail_message_id,
      subject:        message?.subject ?? null,
      snippet:        message?.snippet ?? null,
      archivedCount:  typeof meta.archived_count === "number" ? meta.archived_count : 1,
    };
  });
}
