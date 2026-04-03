import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export type RecoveryActionType = "archive" | "unsubscribe" | "rule_change" | "restore";

export interface RecoveryItem {
  id:             string;
  actionType:     RecoveryActionType;
  actionSource:   string;
  reason:         string | null;
  reversible:     boolean;
  undone:         boolean;
  undoneAt:       string | null;
  createdAt:      string;
  // sender info
  senderId:       string | null;
  senderEmail:    string | null;
  senderName:     string | null;
  // gmail reference
  gmailMessageId: string | null;
  // metadata
  metadata:       Record<string, unknown>;
}

const VALID_TYPES = new Set(["archive", "unsubscribe", "rule_change", "restore"]);

export async function GET(req: NextRequest) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const supabaseUserId = user.id as string;

  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get("type");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 200);

  // ── Query actions_log ──────────────────────────────────────────────────────
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

  let query = supabase
    .from("actions_log")
    .select(
      "id, action_type, action_source, reason, reversible, undone, undone_at, " +
      "created_at, sender_id, gmail_message_id, metadata"
    )
    .eq("user_id", supabaseUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeFilter && VALID_TYPES.has(typeFilter)) {
    query = query.eq("action_type", typeFilter);
  }

  const { data: actions } = await query as unknown as { data: ActionRow[] | null };

  if (!actions?.length) {
    return NextResponse.json({ items: [] });
  }

  // ── Join sender data ───────────────────────────────────────────────────────
  const senderIds = [...new Set(actions.map(a => a.sender_id).filter(Boolean))] as string[];

  type SenderRow = { id: string; sender_email: string; sender_name: string | null };

  const { data: senders } = await supabase
    .from("senders")
    .select("id, sender_email, sender_name")
    .in("id", senderIds) as unknown as { data: SenderRow[] | null };

  const senderMap = new Map<string, SenderRow>();
  for (const s of senders ?? []) senderMap.set(s.id, s);

  const items: RecoveryItem[] = actions.map(a => {
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
      senderEmail:    sender?.sender_email  ?? null,
      senderName:     sender?.sender_name   ?? null,
      gmailMessageId: a.gmail_message_id,
      metadata:       a.metadata ?? {},
    };
  });

  return NextResponse.json({ items });
}
