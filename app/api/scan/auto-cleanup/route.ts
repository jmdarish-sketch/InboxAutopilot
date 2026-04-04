import { NextResponse }       from "next/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { getSupabaseUserId }  from "@/lib/auth/get-user";
import { archiveGmailMessages, createGmailFilter } from "@/lib/gmail/actions";
import { setSenderRule }      from "@/lib/senders/set-rule";
import type { ScanProgress }  from "@/app/api/scan/start/route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/scan/auto-cleanup
//
// Runs after the initial scan completes. Automatically archives emails that
// are extremely obviously junk — conservative thresholds only.
//
// Criteria (ALL must be true):
//   - final_category in (spam_like, promotion, newsletter)
//   - confidence_score >= 0.90
//   - has_unsubscribe_header = true
//   - sender has zero opens, replies, and stars across ALL their emails
//   - email is older than 7 days
//
// This runs in one shot (not chunked) because it only touches DB + Gmail
// batch API, not individual message fetches.
// ---------------------------------------------------------------------------

const JUNK_CATEGORIES = ["spam_like", "promotion", "newsletter"];
const CONFIDENCE_THRESHOLD = 0.90;
const AGE_DAYS = 7;
const BATCH_SIZE = 500; // Gmail batchModify limit per call

export async function POST() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Check if auto-cleanup is expected
  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("id, sync_status")
    .eq("user_id", supabaseUserId)
    .single() as unknown as {
      data: { id: string; sync_status: string } | null;
    };

  if (!gmailAccount) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  // If already completed (sync_status is "synced"), return done
  if (gmailAccount.sync_status === "synced") {
    return NextResponse.json({
      stage: "complete",
      autoArchived: 0,
      autoArchivedSenders: 0,
      message: "Auto-cleanup already completed.",
    });
  }

  const cutoffDate = new Date(Date.now() - AGE_DAYS * 86_400_000).toISOString();

  try {
    // ── 1. Find senders with zero engagement ──────────────────────────────
    const { data: zeroEngagementSenders } = await supabase
      .from("senders")
      .select("id, sender_email")
      .eq("user_id", supabaseUserId)
      .eq("open_count", 0)
      .eq("reply_count", 0)
      .gt("message_count", 0) as unknown as {
        data: Array<{ id: string; sender_email: string }> | null;
      };

    if (!zeroEngagementSenders || zeroEngagementSenders.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    const senderIds = zeroEngagementSenders.map(s => s.id);

    // Also exclude senders whose messages have been starred
    const { data: starredSenders } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("user_id", supabaseUserId)
      .eq("is_starred", true)
      .in("sender_id", senderIds);

    const starredSet = new Set((starredSenders ?? []).map(m => m.sender_id));
    const eligibleSenderIds = senderIds.filter(id => !starredSet.has(id));

    if (eligibleSenderIds.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    // ── 2. Find junk messages from those senders ──────────────────────────
    const { data: junkMessages } = await supabase
      .from("messages")
      .select("id, gmail_message_id, sender_id")
      .eq("user_id", supabaseUserId)
      .in("final_category", JUNK_CATEGORIES)
      .gte("confidence_score", CONFIDENCE_THRESHOLD)
      .eq("has_unsubscribe_header", true)
      .lte("internal_date", cutoffDate)
      .in("sender_id", eligibleSenderIds)
      .eq("action_status", "none") as unknown as {
        data: Array<{ id: string; gmail_message_id: string; sender_id: string }> | null;
      };

    if (!junkMessages || junkMessages.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    // ── 3. Archive via Gmail API ──────────────────────────────────────────
    const gmailIds = junkMessages.map(m => m.gmail_message_id).filter(Boolean);

    if (gmailIds.length > 0) {
      // archiveGmailMessages already handles batching and the Autopilot/Archived label
      await archiveGmailMessages(supabaseUserId, gmailIds);
    }

    // ── 4. Update message status ──────────────────────────────────────────
    const messageIds = junkMessages.map(m => m.id);
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const chunk = messageIds.slice(i, i + BATCH_SIZE);
      await supabase
        .from("messages")
        .update({
          action_status:   "succeeded",
          executed_action: "archive",
          review_status:   "not_needed",
          updated_at:      new Date().toISOString(),
        })
        .eq("user_id", supabaseUserId)
        .in("id", chunk);
    }

    // ── 5. Log actions ────────────────────────────────────────────────────
    // Group by sender for efficient logging
    const bySender = new Map<string, string[]>();
    for (const m of junkMessages) {
      const list = bySender.get(m.sender_id) ?? [];
      list.push(m.gmail_message_id);
      bySender.set(m.sender_id, list);
    }

    for (const [senderId, gmailMsgIds] of bySender) {
      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     senderId,
        action_type:   "archive",
        action_source: "initial_cleanup_auto",
        status:        "succeeded",
        reason:        "auto_junk_cleanup",
        reversible:    true,
        metadata:      { archived_count: gmailMsgIds.length },
      });
    }

    // ── 6. Auto-rules for heavy senders ───────────────────────────────────
    // Senders with 5+ junk messages: create always_archive rule + Gmail filter
    const autoRuleSenders: string[] = [];
    for (const [senderId, gmailMsgIds] of bySender) {
      if (gmailMsgIds.length >= 5) {
        autoRuleSenders.push(senderId);
        await setSenderRule(supabaseUserId, senderId, "always_archive", "initial_cleanup_auto");

        const senderEmail = zeroEngagementSenders.find(s => s.id === senderId)?.sender_email;
        if (senderEmail) {
          const filterResult = await createGmailFilter(supabaseUserId, senderEmail);
          await supabase.from("actions_log").insert({
            user_id:       supabaseUserId,
            sender_id:     senderId,
            action_type:   "gmail_filter_created",
            action_source: "initial_cleanup_auto",
            status:        filterResult.created ? "succeeded" : "failed",
            reason:        `auto_junk_sender_${gmailMsgIds.length}_emails`,
            metadata:      { filter_id: filterResult.filterId },
          });
        }
      }
    }

    // ── 7. Mark complete ──────────────────────────────────────────────────
    return complete(
      supabase,
      supabaseUserId,
      gmailAccount.id,
      junkMessages.length,
      bySender.size
    );

  } catch (err) {
    console.error("[auto-cleanup] error:", err);
    // On error, still finalize so the user isn't stuck
    await supabase
      .from("gmail_accounts")
      .update({ sync_status: "synced", updated_at: new Date().toISOString() })
      .eq("id", gmailAccount.id);
    await supabase
      .from("users")
      .update({ onboarding_status: "initial_scan_complete", updated_at: new Date().toISOString() })
      .eq("id", supabaseUserId);

    return NextResponse.json({
      stage:               "complete",
      autoArchived:        0,
      autoArchivedSenders: 0,
      message:             "Auto-cleanup encountered an error but your scan is complete.",
    } satisfies Partial<ScanProgress>);
  }
}

async function complete(
  supabase: ReturnType<typeof createAdminClient>,
  supabaseUserId: string,
  gmailAccountId: string,
  archived: number,
  senders: number,
) {
  await Promise.all([
    supabase
      .from("gmail_accounts")
      .update({ sync_status: "synced", updated_at: new Date().toISOString() })
      .eq("id", gmailAccountId),
    supabase
      .from("users")
      .update({ onboarding_status: "initial_scan_complete", updated_at: new Date().toISOString() })
      .eq("id", supabaseUserId),
  ]);

  const message = archived > 0
    ? `Auto-archived ${archived.toLocaleString()} obvious junk emails from ${senders} sender${senders !== 1 ? "s" : ""}.`
    : "No obvious junk found — your inbox is cleaner than most.";

  return NextResponse.json({
    stage:               "complete",
    autoArchived:        archived,
    autoArchivedSenders: senders,
    message,
  });
}
