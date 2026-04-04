import { NextRequest, NextResponse } from "next/server";
import { createAdminClient }         from "@/lib/supabase/admin";
import { getSupabaseUserId }         from "@/lib/auth/get-user";
import { createGmailClient }         from "@/lib/gmail/client";
import { recordFeedbackAndRetrain }  from "@/lib/autopilot/learning";

export async function POST(req: NextRequest) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let body: { actionId: string };
  try {
    body = (await req.json()) as { actionId: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Fetch the action ───────────────────────────────────────────────────────
  type ActionRow = {
    id: string;
    action_type: string;
    gmail_message_id: string | null;
    sender_id: string | null;
    reversible: boolean;
    undone: boolean;
  };

  const { data: action } = await supabase
    .from("actions_log")
    .select("id, action_type, gmail_message_id, sender_id, reversible, undone")
    .eq("id", body.actionId)
    .eq("user_id", supabaseUserId)
    .single() as unknown as { data: ActionRow | null };

  if (!action)      return NextResponse.json({ error: "Action not found" },  { status: 404 });
  if (action.undone) return NextResponse.json({ error: "Already undone" },   { status: 409 });
  if (!action.reversible) return NextResponse.json({ error: "Not reversible" }, { status: 400 });

  // ── §3.15 Undo logic ───────────────────────────────────────────────────────

  if (action.action_type === "archive" && action.gmail_message_id) {
    // Restore to inbox: add INBOX label
    try {
      const gmail = await createGmailClient(supabaseUserId);
      await gmail.post(
        `/gmail/v1/users/me/messages/${action.gmail_message_id}/modify`,
        { addLabelIds: ["INBOX"] }
      );
    } catch (err) {
      console.error("[recovery/undo] Gmail restore failed:", err);
      // Don't block the DB update — the message may have been permanently deleted
      // on Gmail's side. We still mark it undone to prevent repeated attempts.
    }
  }

  if (action.action_type === "unsubscribe" && action.sender_id) {
    // §3.15: Can't reverse sender-side unsubscribe.
    // Create always_keep rule so future emails are preserved.
    await supabase
      .from("sender_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("user_id", supabaseUserId)
      .eq("sender_id", action.sender_id)
      .eq("active", true);

    await supabase.from("sender_rules").insert({
      user_id:     supabaseUserId,
      sender_id:   action.sender_id,
      rule_type:   "sender_exact",
      rule_action: "always_keep",
      source:      "user_manual",
    });

    // Reset sender learned state to unknown so the system re-learns
    await supabase
      .from("senders")
      .update({
        learned_state:   "unknown",
        review_required: true,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", action.sender_id)
      .eq("user_id", supabaseUserId);
  }

  // ── Mark undone ────────────────────────────────────────────────────────────
  await supabase
    .from("actions_log")
    .update({ undone: true, undone_at: new Date().toISOString() })
    .eq("id", body.actionId);

  // Log the undo itself
  await supabase.from("actions_log").insert({
    user_id:       supabaseUserId,
    sender_id:     action.sender_id,
    gmail_message_id: action.action_type === "archive" ? action.gmail_message_id : null,
    action_type:   "restore",
    action_source: "user_manual",
    status:        "succeeded",
    reason:        `undo_${action.action_type}`,
    reversible:    false,
  });

  // ── Feed undo back into the learning loop ──────────────────────────────────
  if (action.sender_id) {
    if (action.action_type === "archive") {
      // Restoring an archived message = strong signal this sender matters
      await recordFeedbackAndRetrain(supabaseUserId, "email_restored", {
        senderId: action.sender_id,
      });
    } else if (action.action_type === "unsubscribe") {
      // Undoing an unsubscribe = user wants to keep receiving from this sender
      await recordFeedbackAndRetrain(supabaseUserId, "sender_keep_forever", {
        senderId: action.sender_id,
      });
    }
  }

  return NextResponse.json({ success: true });
}
