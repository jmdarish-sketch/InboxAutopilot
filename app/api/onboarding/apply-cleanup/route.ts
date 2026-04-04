import { NextRequest, NextResponse }  from "next/server";
import { createAdminClient }          from "@/lib/supabase/admin";
import { getSupabaseUserId }          from "@/lib/auth/get-user";
import { archiveGmailMessages, attemptUnsubscribe } from "@/lib/gmail/actions";
import { setSenderRule }              from "@/lib/senders/set-rule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CleanupSelection {
  senderId: string;
  action:   "archive" | "unsubscribe_and_archive" | "keep";
}

interface RequestBody {
  selections: CleanupSelection[];
}

// ---------------------------------------------------------------------------
// POST /api/onboarding/apply-cleanup
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Parse body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.selections)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Process each selection
  let totalArchived = 0;

  for (const sel of body.selections) {
    if (sel.action === "keep") {
      await setSenderRule(supabaseUserId, sel.senderId, "always_keep", "onboarding_cleanup");
      continue;
    }

    // Gather all message IDs for this sender
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, gmail_message_id")
      .eq("user_id", supabaseUserId)
      .eq("sender_id", sel.senderId)
      .not("gmail_message_id", "is", null);

    const gmailIds = (msgs ?? [])
      .map(m => m.gmail_message_id as string)
      .filter(Boolean);
    const archived = gmailIds.length;

    try {
      // 1. Archive in Gmail
      if (gmailIds.length > 0) {
        await archiveGmailMessages(supabaseUserId, gmailIds);
      }

      // 2. Mark messages handled in DB
      if (msgs && msgs.length > 0) {
        await supabase
          .from("messages")
          .update({ review_status: "user_archived", executed_action: "archive" })
          .eq("user_id", supabaseUserId)
          .eq("sender_id", sel.senderId);
      }

      // 3. Attempt unsubscribe if requested
      let unsubscribeResult: { attempted: boolean; method: string; success: boolean } = { attempted: false, method: "none", success: false };
      if (sel.action === "unsubscribe_and_archive") {
        unsubscribeResult = await attemptUnsubscribe(supabaseUserId, sel.senderId);
      }

      // 4. Log the action
      await supabase.from("actions_log").insert({
        user_id:      supabaseUserId,
        sender_id:    sel.senderId,
        action_type:  sel.action === "unsubscribe_and_archive" ? "unsubscribe" : "archive",
        action_source: "initial_cleanup",
        status:       "succeeded",
        metadata:     {
          archived_count: archived,
          ...(sel.action === "unsubscribe_and_archive" ? { unsubscribe: unsubscribeResult } : {}),
        },
      });

      // 5. Create sender rule so autopilot knows to keep archiving
      await setSenderRule(supabaseUserId, sel.senderId, "always_archive", "onboarding_cleanup");

      totalArchived += archived;
    } catch (err) {
      console.error(`[apply-cleanup] failed for sender ${sel.senderId}:`, err);

      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     sel.senderId,
        action_type:   sel.action === "unsubscribe_and_archive" ? "unsubscribe" : "archive",
        action_source: "initial_cleanup",
        status:        "failed",
        reversible:    false,
        metadata:      { error: String(err) },
      });
    }
  }

  // Advance onboarding status
  await supabase
    .from("users")
    .update({ onboarding_status: "cleanup_reviewed", updated_at: new Date().toISOString() })
    .eq("id", supabaseUserId);

  return NextResponse.json({ success: true, totalArchived });
}
