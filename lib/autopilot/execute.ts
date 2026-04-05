import { createAdminClient }              from "@/lib/supabase/admin";
import { createGmailClient }              from "@/lib/gmail/client";
import { syncIncrementalMessages }        from "@/lib/gmail/history";
import { extractFeatures }                from "@/lib/classification/features";
import { classifyDeterministically }      from "@/lib/classification/rules";
import { scoreMessage }                   from "@/lib/classification/scorer";
import { shouldUseLLM, classifyWithLLM }  from "@/lib/classification/llm";
import { resolveFinalClassification }     from "@/lib/classification/final-decision";
import { decideAutopilotExecution }       from "@/lib/autopilot/policy";
import { computeBehaviorScore }           from "@/lib/autopilot/learning";
import { computeSenderJunkScore, MODE_THRESHOLDS } from "@/lib/scoring/junk-score";
import { createGmailFilter }             from "@/lib/gmail/actions";
import { setSenderRule }                  from "@/lib/senders/set-rule";
import type { AutopilotMode }             from "@/lib/autopilot/policy";
import type { NormalizedMessage }         from "@/lib/gmail/types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface FullSenderRow {
  id:              string;
  sender_email:    string;
  message_count:   number;
  open_count:      number;
  reply_count:     number;
  archive_count:   number;
  restore_count:   number;
  click_count:     number;
  search_count:    number;
  ignore_count:    number;
  last_seen_at:    string | null;
  last_engaged_at: string | null;
  learned_state:   string;
  sender_category: string | null;
}

// ---------------------------------------------------------------------------
// runAutopilot  (§3.12)
//
// Entry point for the autopilot job.  Called by the API route once per user
// per scheduled interval (typically every 5–15 minutes).
//
// Steps:
//   1. Incremental Gmail sync — only new inbox messages since last run.
//   2. For each new message:
//      a. Upsert sender record (creates if first time, reads existing stats).
//      b. Extract feature vector.
//      c. Deterministic classification layer.
//      d. Scoring layer.
//      e. LLM gate + call if needed.
//      f. Final classification resolution.
//      g. Autopilot execution policy decision (based on user's mode).
//      h. Execute: archive via Gmail API / insert review_queue / no-op.
//      i. Persist message row + log action.
//   3. Update sender aggregate counters for any archived messages.
// ---------------------------------------------------------------------------

export async function runAutopilot(supabaseUserId: string): Promise<{
  processed: number;
  archived:  number;
  queued:    number;
  kept:      number;
}> {
  const supabase = createAdminClient();

  // ── 1. Get user's autopilot mode ─────────────────────────────────────────
  type UserRow = { autopilot_mode: string };
  const { data: userRow } = await supabase
    .from("users")
    .select("autopilot_mode")
    .eq("id", supabaseUserId)
    .single() as unknown as { data: UserRow | null };

  if (!userRow) throw new Error(`[autopilot] user not found: ${supabaseUserId}`);

  const mode = (userRow.autopilot_mode ?? "safe") as AutopilotMode;

  // ── 2. Incremental sync ───────────────────────────────────────────────────
  let newMessages: NormalizedMessage[];
  try {
    newMessages = await syncIncrementalMessages(supabaseUserId);
  } catch (err) {
    console.error("[autopilot] incremental sync failed:", err);
    return { processed: 0, archived: 0, queued: 0, kept: 0 };
  }

  if (newMessages.length === 0) {
    return { processed: 0, archived: 0, queued: 0, kept: 0 };
  }

  // ── 3. Process each message ───────────────────────────────────────────────
  let archived = 0;
  let queued   = 0;
  let kept     = 0;

  // Lazily create Gmail client only if we need to archive something
  let gmailClient: Awaited<ReturnType<typeof createGmailClient>> | null = null;

  async function getGmail() {
    if (!gmailClient) {
      gmailClient = await createGmailClient(supabaseUserId);
    }
    return gmailClient;
  }

  for (const msg of newMessages) {
    try {
      // ── a. Upsert sender ────────────────────────────────────────────────
      const sender = await upsertSender(supabaseUserId, msg);

      // ── b-d. Feature + deterministic + scoring ──────────────────────────
      const features      = extractFeatures(msg, sender);
      const deterministic = classifyDeterministically(msg, features);
      const scored        = scoreMessage(msg, sender, features, deterministic);

      // ── e. LLM gate ─────────────────────────────────────────────────────
      let llmDecision = null;
      if (shouldUseLLM(scored, deterministic, sender)) {
        llmDecision = await classifyWithLLM(msg, features);
      }

      // ── f. Final classification ──────────────────────────────────────────
      const final = resolveFinalClassification({
        parsed:        msg,
        sender,
        deterministic,
        scored,
        llmDecision,
      });

      // ── g. Execution decision ────────────────────────────────────────────
      let execution = decideAutopilotExecution(final, sender.restore_count, mode);

      // Junk-score override: if the classifier is uncertain but the sender's
      // weighted junk score exceeds the mode threshold, archive anyway.
      if (execution.type === "queue_review" && sender.message_count >= 3) {
        const hasUnsub = msg.has_unsubscribe_header ?? false;
        const junkResult = computeSenderJunkScore({
          message_count:     sender.message_count,
          open_count:        sender.open_count,
          reply_count:       sender.reply_count,
          archive_count:     sender.archive_count,
          restore_count:     sender.restore_count,
          ignore_count:      sender.ignore_count,
          dominant_category: sender.sender_category,
          has_unsubscribe:   hasUnsub,
          last_engaged_at:   sender.last_engaged_at,
          learned_state:     sender.learned_state,
        });

        const thresholds = MODE_THRESHOLDS[mode] ?? MODE_THRESHOLDS.balanced;
        if (junkResult.score >= thresholds.archiveThreshold) {
          execution = {
            type:   "auto_archive",
            reason: `junk_score=${junkResult.score.toFixed(2)}_above_${mode}_threshold`,
          };
        }
      }

      // ── h. Persist message row ───────────────────────────────────────────
      const { data: savedMsg } = await supabase
        .from("messages")
        .insert({
          user_id:              supabaseUserId,
          sender_id:            sender.id,
          gmail_message_id:     msg.gmail_message_id,
          gmail_thread_id:      msg.gmail_thread_id,
          gmail_history_id:     msg.gmail_history_id,
          subject:              msg.subject,
          snippet:              msg.snippet,
          body_text:            msg.body_text,
          body_html:            msg.body_html,
          internal_date:        msg.internal_date,
          has_attachments:      msg.has_attachments,
          is_read:              msg.is_read,
          is_starred:           msg.is_starred,
          is_important_label:   msg.is_important_label,
          gmail_category:       msg.gmail_category,
          label_ids:            msg.label_ids,
          has_unsubscribe_header: msg.has_unsubscribe_header,
          unsubscribe_url:      msg.unsubscribe_url,
          unsubscribe_mailto:   msg.unsubscribe_mailto,
          is_newsletter:        msg.is_newsletter,
          is_promotion:         msg.is_promotion,
          is_transactional:     msg.is_transactional,
          is_security_related:  msg.is_security_related,
          is_personal_like:     msg.is_personal_like,
          contains_time_sensitive_terms: msg.contains_time_sensitive_terms,
          deterministic_category: deterministic.category,
          final_category:        final.finalCategory,
          importance_score:      scored.importanceScore,
          clutter_score:         scored.clutterScore,
          risk_score:            scored.riskScore,
          confidence_score:      final.confidenceScore,
          recommended_action:    final.recommendedAction,
          executed_action:       execution.type === "auto_archive" ? "archive"
                               : execution.type === "keep_inbox"  ? "keep_inbox"
                               : "none",
          action_status:        "pending",
          action_reason:        final.reason,
          review_status:        execution.type === "queue_review" ? "queued" : "not_needed",
        })
        .select("id")
        .single() as unknown as { data: { id: string } | null };

      const savedMessageId = savedMsg?.id ?? null;

      // ── i. Execute and log ───────────────────────────────────────────────
      if (execution.type === "auto_archive") {
        try {
          const gmail = await getGmail();
          await gmail.batchModifyLabels([msg.gmail_message_id], undefined, ["INBOX"]);

          // Update message status
          if (savedMessageId) {
            await supabase
              .from("messages")
              .update({ action_status: "succeeded" })
              .eq("id", savedMessageId);
          }

          // Log the action
          await supabase.from("actions_log").insert({
            user_id:          supabaseUserId,
            sender_id:        sender.id,
            message_id:       savedMessageId,
            gmail_message_id: msg.gmail_message_id,
            action_type:      "archive",
            action_source:    "system_autopilot",
            status:           "succeeded",
            reason:           execution.reason,
            reversible:       true,
          });

          // Increment sender archive_count
          await supabase
            .from("senders")
            .update({
              archive_count: sender.archive_count + 1,
              updated_at:    new Date().toISOString(),
            })
            .eq("id", sender.id);

          archived++;
        } catch (archiveErr) {
          console.error("[autopilot] archive failed for", msg.gmail_message_id, archiveErr);

          if (savedMessageId) {
            await supabase
              .from("messages")
              .update({ action_status: "failed" })
              .eq("id", savedMessageId);
          }

          await supabase.from("actions_log").insert({
            user_id:          supabaseUserId,
            sender_id:        sender.id,
            message_id:       savedMessageId,
            gmail_message_id: msg.gmail_message_id,
            action_type:      "archive",
            action_source:    "system_autopilot",
            status:           "failed",
            reason:           execution.reason,
            reversible:       false,
          });
        }

      } else if (execution.type === "queue_review") {
        if (savedMessageId) {
          // Insert to review_queue (ignore conflict if already there)
          await supabase
            .from("review_queue")
            .upsert({
              user_id:      supabaseUserId,
              message_id:   savedMessageId,
              sender_id:    sender.id,
              queue_reason: execution.reason,
              priority:     Math.round((100 - final.confidenceScore * 100)),
              expires_at:   new Date(Date.now() + 7 * 86_400_000).toISOString(), // 7 days
            }, { onConflict: "user_id,message_id" });
        }
        queued++;

      } else {
        // keep_inbox — no Gmail action needed
        kept++;
      }

      // Update sender message_count and last_seen_at for every new message
      await supabase
        .from("senders")
        .update({
          message_count: sender.message_count + 1,
          last_seen_at:  new Date().toISOString(),
          updated_at:    new Date().toISOString(),
        })
        .eq("id", sender.id);

    } catch (msgErr) {
      console.error("[autopilot] error processing message", msg.gmail_message_id, msgErr);
      // Continue to next message — one failure shouldn't halt the whole run
    }
  }

  // ── 4. Automatic rule promotion — check if any senders crossed thresholds ──
  //    Collect unique sender IDs from this batch
  const processedSenderIds = new Set<string>();
  for (const msg of newMessages) {
    if (msg.sender_email) {
      const { data: s } = await supabase
        .from("senders")
        .select("id")
        .eq("user_id", supabaseUserId)
        .eq("sender_email", msg.sender_email)
        .maybeSingle() as unknown as { data: { id: string } | null };
      if (s) processedSenderIds.add(s.id);
    }
  }

  for (const senderId of processedSenderIds) {
    try {
      const { data: senderRow } = await supabase
        .from("senders")
        .select("id, sender_email, open_count, reply_count, restore_count, ignore_count, archive_count, learned_state, message_count")
        .eq("id", senderId)
        .single() as unknown as {
          data: {
            id: string; sender_email: string;
            open_count: number; reply_count: number; restore_count: number;
            ignore_count: number; archive_count: number;
            learned_state: string; message_count: number;
          } | null;
        };

      if (!senderRow || senderRow.message_count < 5) continue; // need enough data

      const result = computeBehaviorScore(senderRow);

      if (result.crossed) {
        // Update sender learned_state
        await supabase
          .from("senders")
          .update({ learned_state: result.recommendedState, updated_at: new Date().toISOString() })
          .eq("id", senderId);

        // If promoted to always_archive, create a Gmail filter
        if (result.recommendedState === "always_archive") {
          await setSenderRule(supabaseUserId, senderId, "always_archive", "system_learned");

          const filterResult = await createGmailFilter(supabaseUserId, senderRow.sender_email);

          await supabase.from("actions_log").insert({
            user_id:       supabaseUserId,
            sender_id:     senderId,
            action_type:   "gmail_filter_created",
            action_source: "system_learned",
            status:        filterResult.created ? "succeeded" : "failed",
            reason:        `behavior_score=${result.score}, promoted from ${result.previousState}`,
            metadata:      { behavior_score: result.score, filter_id: filterResult.filterId },
          });

          console.log(
            `[autopilot] Auto-promoted ${senderRow.sender_email} to always_archive (score=${result.score})`
          );
        }
      }
    } catch (err) {
      console.error(`[autopilot] promotion check failed for sender ${senderId}:`, err);
    }
  }

  return {
    processed: newMessages.length,
    archived,
    queued,
    kept,
  };
}

// ---------------------------------------------------------------------------
// upsertSender
//
// Returns the existing sender record or creates a new one.
// Increments message_count and updates last_seen_at on every call.
// ---------------------------------------------------------------------------

async function upsertSender(
  supabaseUserId: string,
  msg: NormalizedMessage
): Promise<FullSenderRow> {
  if (!msg.sender_email) {
    // Return a blank sender record so classification can still run
    return blankSender();
  }

  const supabase = createAdminClient();

  // Try to find existing sender
  const { data: existing } = await supabase
    .from("senders")
    .select(
      "id, sender_email, message_count, open_count, reply_count, archive_count, restore_count, " +
      "click_count, search_count, ignore_count, last_seen_at, last_engaged_at, learned_state, sender_category"
    )
    .eq("user_id", supabaseUserId)
    .eq("sender_email", msg.sender_email)
    .maybeSingle() as unknown as { data: FullSenderRow | null };

  if (existing) return existing;

  // Create new sender
  const { data: created } = await supabase
    .from("senders")
    .insert({
      user_id:         supabaseUserId,
      sender_email:    msg.sender_email,
      sender_name:     msg.sender_name,
      sender_domain:   msg.sender_domain ?? msg.sender_email.split("@")[1] ?? "",
      first_seen_at:   new Date().toISOString(),
      last_seen_at:    new Date().toISOString(),
      learned_state:   "unknown",
      message_count:   0,
      open_count:      0,
      reply_count:     0,
      archive_count:   0,
      restore_count:   0,
      click_count:     0,
      search_count:    0,
      unsubscribe_count: 0,
      trust_score:     0,
      importance_score: 0,
      clutter_score:   0,
    })
    .select(
      "id, message_count, open_count, reply_count, archive_count, restore_count, " +
      "click_count, search_count, last_seen_at, learned_state"
    )
    .single() as unknown as { data: FullSenderRow | null };

  return created ?? blankSender();
}

function blankSender(): FullSenderRow {
  return {
    id:              "",
    sender_email:    "",
    message_count:   0,
    open_count:      0,
    reply_count:     0,
    archive_count:   0,
    restore_count:   0,
    click_count:     0,
    search_count:    0,
    ignore_count:    0,
    last_seen_at:    null,
    last_engaged_at: null,
    learned_state:   "unknown",
    sender_category: null,
  };
}
