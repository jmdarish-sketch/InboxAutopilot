import { NextRequest, NextResponse }   from "next/server";
import { createAdminClient }           from "@/lib/supabase/admin";
import { getSupabaseUserId }           from "@/lib/auth/get-user";
import { archiveGmailMessages, attemptUnsubscribe, createGmailFilter } from "@/lib/gmail/actions";
import { recordFeedbackAndRetrain }    from "@/lib/review/learning";
import { setSenderRule }               from "@/lib/senders/set-rule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewAction =
  | "keep"
  | "archive"
  | "always_keep"
  | "always_archive"
  | "unsubscribe";

interface ResolveBody {
  queueId:   string;
  messageId: string;
  action:    ReviewAction;
  senderId?: string;
}

// ---------------------------------------------------------------------------
// POST /api/review/resolve
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { queueId, messageId, action, senderId: bodySenderId } = body;

  // Fetch the message + sender once (needed by multiple action branches)
  const { data: msg } = await supabase
    .from("messages")
    .select("gmail_message_id, sender_id")
    .eq("id", messageId)
    .eq("user_id", supabaseUserId)
    .single();

  const senderId = bodySenderId ?? msg?.sender_id ?? null;

  // ── 1. Mark review_queue resolved ──────────────────────────────────────

  await supabase
    .from("review_queue")
    .update({
      resolved:        true,
      resolved_action: action,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", queueId)
    .eq("user_id", supabaseUserId);

  // ── 2. Execute action ───────────────────────────────────────────────────

  switch (action) {
    // ── Keep ──────────────────────────────────────────────────────────────
    case "keep": {
      await supabase
        .from("messages")
        .update({ review_status: "user_kept" })
        .eq("id", messageId)
        .eq("user_id", supabaseUserId);

      await recordFeedbackAndRetrain(supabaseUserId, "email_opened", {
        senderId:  senderId ?? undefined,
        messageId,
      });
      break;
    }

    // ── Archive ───────────────────────────────────────────────────────────
    case "archive": {
      if (msg?.gmail_message_id) {
        await archiveGmailMessages(supabaseUserId, [msg.gmail_message_id]);
      }

      await supabase.from("actions_log").insert({
        user_id:          supabaseUserId,
        sender_id:        senderId,
        message_id:       messageId,
        gmail_message_id: msg?.gmail_message_id ?? null,
        action_type:      "archive",
        action_source:    "review_queue",
        status:           "succeeded",
        reason:           "user_review_archive",
      });

      await supabase
        .from("messages")
        .update({ review_status: "user_archived", executed_action: "archive" })
        .eq("id", messageId)
        .eq("user_id", supabaseUserId);

      await recordFeedbackAndRetrain(supabaseUserId, "email_archived_manual", {
        senderId:  senderId ?? undefined,
        messageId,
      });
      break;
    }

    // ── Always keep sender ────────────────────────────────────────────────
    case "always_keep": {
      await supabase
        .from("messages")
        .update({ review_status: "user_kept" })
        .eq("id", messageId)
        .eq("user_id", supabaseUserId);

      if (senderId) {
        await setSenderRule(supabaseUserId, senderId, "always_keep", "user_manual");
      }

      await recordFeedbackAndRetrain(supabaseUserId, "sender_keep_forever", {
        senderId:  senderId ?? undefined,
        messageId,
      });
      break;
    }

    // ── Always archive sender ─────────────────────────────────────────────
    case "always_archive": {
      // Archive the current message in Gmail
      if (msg?.gmail_message_id) {
        await archiveGmailMessages(supabaseUserId, [msg.gmail_message_id]);
      }

      await supabase
        .from("messages")
        .update({ review_status: "user_archived", executed_action: "archive" })
        .eq("id", messageId)
        .eq("user_id", supabaseUserId);

      await supabase.from("actions_log").insert({
        user_id:          supabaseUserId,
        sender_id:        senderId,
        message_id:       messageId,
        gmail_message_id: msg?.gmail_message_id ?? null,
        action_type:      "archive",
        action_source:    "review_queue",
        status:           "succeeded",
        reason:           "user_always_archive",
      });

      if (senderId) {
        await setSenderRule(supabaseUserId, senderId, "always_archive", "user_manual");
        // Create Gmail filter for preventative blocking
        if (msg?.gmail_message_id) {
          const senderEmail = await getSenderEmail(supabase, supabaseUserId, senderId);
          if (senderEmail) {
            await createGmailFilter(supabaseUserId, senderEmail);
          }
        }
      }

      await recordFeedbackAndRetrain(supabaseUserId, "sender_archive_forever", {
        senderId:  senderId ?? undefined,
        messageId,
      });
      break;
    }

    // ── Unsubscribe ───────────────────────────────────────────────────────
    case "unsubscribe": {
      // Archive first
      if (msg?.gmail_message_id) {
        await archiveGmailMessages(supabaseUserId, [msg.gmail_message_id]);
      }

      // Attempt unsubscribe
      if (senderId) {
        await attemptUnsubscribe(supabaseUserId, senderId);
      }

      await supabase.from("actions_log").insert({
        user_id:          supabaseUserId,
        sender_id:        senderId,
        message_id:       messageId,
        gmail_message_id: msg?.gmail_message_id ?? null,
        action_type:      "unsubscribe",
        action_source:    "review_queue",
        status:           "succeeded",
        reason:           "user_review_unsubscribe",
      });

      await supabase
        .from("messages")
        .update({ review_status: "user_archived", executed_action: "archive" })
        .eq("id", messageId)
        .eq("user_id", supabaseUserId);

      await recordFeedbackAndRetrain(supabaseUserId, "unsubscribe_confirmed", {
        senderId:  senderId ?? undefined,
        messageId,
      });
      break;
    }
  }

  return NextResponse.json({ success: true });
}

async function getSenderEmail(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  senderId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("senders")
    .select("sender_email")
    .eq("id", senderId)
    .eq("user_id", userId)
    .single() as unknown as { data: { sender_email: string } | null };
  return data?.sender_email ?? null;
}
