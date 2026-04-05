import { NextResponse }       from "next/server";
import { createAdminClient }  from "@/lib/supabase/admin";
import { getSupabaseUserId }  from "@/lib/auth/get-user";
import { archiveGmailMessages, createGmailFilter } from "@/lib/gmail/actions";
import { setSenderRule }      from "@/lib/senders/set-rule";
import { computeSenderJunkScore, MODE_THRESHOLDS } from "@/lib/scoring/junk-score";
import type { ScanProgress }  from "@/app/api/scan/start/route";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/scan/auto-cleanup
//
// Runs after the initial scan. Uses weighted junk scoring with the 'safe'
// threshold (0.80) for onboarding — conservative but not absurdly so.
//
// Old approach: required ALL of (spam category, 0.90 confidence, unsub header,
// zero engagement, 7 days old). That was too restrictive.
//
// New approach: score each sender holistically. A sender with 50 emails and
// 2 opens has a 96% ignore rate — that's junk even though open_count != 0.
// ---------------------------------------------------------------------------

const ONBOARDING_THRESHOLD = MODE_THRESHOLDS.safe.archiveThreshold; // 0.80
const FILTER_THRESHOLD     = MODE_THRESHOLDS.safe.filterThreshold;  // 0.92
const AGE_DAYS = 7; // Only archive emails older than 7 days during onboarding
const MIN_MESSAGES = 3; // Need enough data to score

export async function POST() {
  const supabaseUserId = await getSupabaseUserId();
  if (!supabaseUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

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
    // ── 1. Fetch all senders with enough messages to score ────────────────
    const { data: senders } = await supabase
      .from("senders")
      .select(
        "id, sender_email, message_count, open_count, reply_count, archive_count, " +
        "restore_count, ignore_count, sender_category, learned_state, last_engaged_at"
      )
      .eq("user_id", supabaseUserId)
      .gte("message_count", MIN_MESSAGES)
      .neq("learned_state", "always_keep")
      .neq("learned_state", "always_archive") as unknown as {
        data: Array<{
          id: string; sender_email: string; message_count: number;
          open_count: number; reply_count: number; archive_count: number;
          restore_count: number; ignore_count: number;
          sender_category: string | null; learned_state: string;
          last_engaged_at: string | null;
        }> | null;
      };

    if (!senders || senders.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    // ── 2. Check which senders have unsubscribe headers ───────────────────
    const senderIds = senders.map(s => s.id);
    const { data: unsubRows } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("user_id", supabaseUserId)
      .in("sender_id", senderIds)
      .eq("has_unsubscribe_header", true)
      .limit(1000);

    const unsubSet = new Set((unsubRows ?? []).map(r => r.sender_id));

    // Check for starred senders (strong protection)
    const { data: starredRows } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("user_id", supabaseUserId)
      .in("sender_id", senderIds)
      .eq("is_starred", true);

    const starredSet = new Set((starredRows ?? []).map(r => r.sender_id));

    // ── 3. Score each sender ──────────────────────────────────────────────
    const junkSenders: Array<{ id: string; email: string; score: number; signals: string[] }> = [];

    for (const s of senders) {
      // Skip starred senders entirely
      if (starredSet.has(s.id)) continue;

      const result = computeSenderJunkScore({
        message_count:     s.message_count,
        open_count:        s.open_count,
        reply_count:       s.reply_count,
        archive_count:     s.archive_count,
        restore_count:     s.restore_count,
        ignore_count:      s.ignore_count,
        dominant_category: s.sender_category,
        has_unsubscribe:   unsubSet.has(s.id),
        last_engaged_at:   s.last_engaged_at,
        learned_state:     s.learned_state,
      });

      if (result.score >= ONBOARDING_THRESHOLD) {
        junkSenders.push({
          id:      s.id,
          email:   s.sender_email,
          score:   result.score,
          signals: result.signals,
        });
      }
    }

    if (junkSenders.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    // ── 4. Find archivable messages from junk senders ─────────────────────
    const junkSenderIds = junkSenders.map(s => s.id);

    const { data: junkMessages } = await supabase
      .from("messages")
      .select("id, gmail_message_id, sender_id")
      .eq("user_id", supabaseUserId)
      .in("sender_id", junkSenderIds)
      .eq("action_status", "none")
      .lte("internal_date", cutoffDate) as unknown as {
        data: Array<{ id: string; gmail_message_id: string; sender_id: string }> | null;
      };

    if (!junkMessages || junkMessages.length === 0) {
      return complete(supabase, supabaseUserId, gmailAccount.id, 0, 0);
    }

    // ── 5. Archive via Gmail API ──────────────────────────────────────────
    const gmailIds = junkMessages.map(m => m.gmail_message_id).filter(Boolean);
    if (gmailIds.length > 0) {
      await archiveGmailMessages(supabaseUserId, gmailIds);
    }

    // ── 6. Update message status ──────────────────────────────────────────
    const messageIds = junkMessages.map(m => m.id);
    for (let i = 0; i < messageIds.length; i += 500) {
      const chunk = messageIds.slice(i, i + 500);
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

    // ── 7. Log actions + create rules/filters for high-score senders ──────
    const bySender = new Map<string, string[]>();
    for (const m of junkMessages) {
      const list = bySender.get(m.sender_id) ?? [];
      list.push(m.gmail_message_id);
      bySender.set(m.sender_id, list);
    }

    const junkScoreMap = new Map(junkSenders.map(s => [s.id, s]));

    for (const [senderId, gmailMsgIds] of bySender) {
      const scored = junkScoreMap.get(senderId);

      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     senderId,
        action_type:   "archive",
        action_source: "initial_cleanup_auto",
        status:        "succeeded",
        reason:        `junk_score=${scored?.score.toFixed(2) ?? "?"}: ${scored?.signals.join(", ") ?? ""}`,
        reversible:    true,
        metadata:      { archived_count: gmailMsgIds.length, junk_score: scored?.score },
      });

      // Create rules + filters for high-confidence junk senders
      if (scored && scored.score >= FILTER_THRESHOLD) {
        await setSenderRule(supabaseUserId, senderId, "always_archive", "initial_cleanup_auto");

        const filterResult = await createGmailFilter(supabaseUserId, scored.email);
        await supabase.from("actions_log").insert({
          user_id:       supabaseUserId,
          sender_id:     senderId,
          action_type:   "gmail_filter_created",
          action_source: "initial_cleanup_auto",
          status:        filterResult.created ? "succeeded" : "failed",
          reason:        `junk_score=${scored.score.toFixed(2)}_above_filter_threshold`,
          metadata:      { filter_id: filterResult.filterId, junk_score: scored.score },
        });
      }
    }

    return complete(supabase, supabaseUserId, gmailAccount.id, junkMessages.length, bySender.size);

  } catch (err) {
    console.error("[auto-cleanup] error:", err);
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
