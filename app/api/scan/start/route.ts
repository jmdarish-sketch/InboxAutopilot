import { auth, currentUser }          from "@clerk/nextjs/server";
import { NextResponse }                from "next/server";
import { createAdminClient }           from "@/lib/supabase/admin";
import { createGmailClient }           from "@/lib/gmail/client";
import { parseMessage }                from "@/lib/gmail/parser";
import { extractFeatures, type SenderRecord } from "@/lib/classification/features";
import { classifyDeterministically }   from "@/lib/classification/rules";
import { scoreMessage }                from "@/lib/classification/scorer";
import { resolveFinalClassification }  from "@/lib/classification/final-decision";
import type { NormalizedMessage }      from "@/lib/gmail/types";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanProgress {
  stage:            "listing" | "processing" | "finalizing" | "complete" | "error";
  emailsScanned:    number;
  emailsTotal:      number;
  sendersFound:     number;
  clutterDetected:  number;
  protectedSenders: number;
  message:          string;
}

/** Persisted in gmail_accounts.scan_state between calls. */
interface ScanState {
  messageIds:       string[];
  cursor:           number;          // index into messageIds — next to process
  sendersFound:     number;
  clutterDetected:  number;
  protectedSenders: number;
}

// ---------------------------------------------------------------------------
// Constants — tuned for 10-second Vercel free-tier timeout
// ---------------------------------------------------------------------------

const BATCH_SIZE     = 30;   // messages per API call
const FETCH_DELAY_MS = 200;  // delay between sequential Gmail fetches
const DB_CHUNK       = 200;  // rows per Supabase upsert
const MAX_RETRIES    = 3;
const INITIAL_BACKOFF = 800; // ms

const CLUTTER_CATEGORIES   = new Set(["promotion", "newsletter", "recurring_low_value", "spam_like"]);
const IMPORTANT_CATEGORIES = new Set(["critical_transactional", "work_school", "personal_human"]);

// ---------------------------------------------------------------------------
// POST /api/scan/start
//
// Chunked scan: each call processes up to BATCH_SIZE messages and returns
// progress. The client polls until stage === "complete".
//
// Flow:
//   1st call  → lists all message IDs, stores in scan_state, returns progress
//   Nth call  → fetches + classifies + saves next batch, returns progress
//   last call → finalizes (updates onboarding_status), returns complete
// ---------------------------------------------------------------------------

export async function POST() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  let clerkResult: Awaited<ReturnType<typeof auth>>;
  let clerkUser: Awaited<ReturnType<typeof currentUser>>;
  try {
    [clerkResult, clerkUser] = await Promise.all([auth(), currentUser()]);
  } catch (err) {
    console.error("[scan] Clerk auth failed:", err);
    return NextResponse.json(
      { error: "Authentication failed", detail: String(err) },
      { status: 401 }
    );
  }

  if (!clerkResult.userId || !clerkUser) {
    console.error("[scan] No Clerk session — userId:", clerkResult.userId, "clerkUser:", !!clerkUser);
    return NextResponse.json(
      { error: "Unauthorized — no active session" },
      { status: 401 }
    );
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    console.error("[scan] Clerk user has no email addresses");
    return NextResponse.json(
      { error: "No email address on Clerk account" },
      { status: 400 }
    );
  }

  // ── Resolve Supabase user ────────────────────────────────────────────────
  const supabase = createAdminClient();

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (userErr || !user) {
    console.error("[scan] User lookup failed — email:", email, "error:", userErr);
    return NextResponse.json(
      { error: "User not found in database", detail: userErr?.message ?? `No row for ${email}` },
      { status: 404 }
    );
  }

  const supabaseUserId = user.id as string;

  // ── Load Gmail account + scan_state ──────────────────────────────────────
  const { data: gmailAccountRaw, error: gmailErr } = await supabase
    .from("gmail_accounts")
    .select("id, scan_state, sync_status")
    .eq("user_id", supabaseUserId)
    .single();

  if (gmailErr || !gmailAccountRaw) {
    console.error("[scan] Gmail account lookup failed — userId:", supabaseUserId, "error:", gmailErr);
    return NextResponse.json(
      { error: "Gmail not connected", detail: gmailErr?.message ?? "No gmail_accounts row found" },
      { status: 400 }
    );
  }

  const gmailAccount = gmailAccountRaw as unknown as {
    id: string;
    scan_state: ScanState | null;
    sync_status: string;
  };

  try {
    // ── Phase 1: List message IDs (first call only) ──────────────────────
    if (!gmailAccount.scan_state) {
      let gmailClient;
      try {
        gmailClient = await createGmailClient(supabaseUserId);
      } catch (err) {
        console.error("[scan] Failed to create Gmail client:", err);
        return NextResponse.json(
          { error: "Gmail authentication failed", detail: err instanceof Error ? err.message : String(err) },
          { status: 401 }
        );
      }

      const afterDate = gmailDateString(120);
      const seen      = new Set<string>();
      const allIds: string[] = [];

      await listIds(gmailClient, `in:inbox after:${afterDate}`, 5000, seen, allIds);
      await listIds(gmailClient, `category:promotions after:${afterDate}`, 5000, seen, allIds);

      const ids = allIds.slice(0, 5000);

      const state: ScanState = {
        messageIds:       ids,
        cursor:           0,
        sendersFound:     0,
        clutterDetected:  0,
        protectedSenders: 0,
      };

      await supabase
        .from("gmail_accounts")
        .update({ scan_state: state, sync_status: "syncing", updated_at: new Date().toISOString() })
        .eq("id", gmailAccount.id);

      const progress: ScanProgress = {
        stage:            "listing",
        emailsScanned:    0,
        emailsTotal:      ids.length,
        sendersFound:     0,
        clutterDetected:  0,
        protectedSenders: 0,
        message:          ids.length > 0
          ? `Found ${ids.length.toLocaleString()} emails — analyzing…`
          : "No recent emails found.",
      };

      // If no messages found, finalize immediately
      if (ids.length === 0) {
        return finalize(supabase, supabaseUserId, gmailAccount.id, state, 0);
      }

      return NextResponse.json(progress);
    }

    // ── Phase 2: Process next batch ──────────────────────────────────────
    const state = gmailAccount.scan_state;
    const messageIds = state.messageIds ?? [];
    const total = messageIds.length;

    if (total === 0) {
      return finalize(supabase, supabaseUserId, gmailAccount.id, state, 0);
    }

    if (state.cursor < total) {
      let gmailClient;
      try {
        gmailClient = await createGmailClient(supabaseUserId);
      } catch (err) {
        console.error("[scan] Failed to create Gmail client:", err);
        return NextResponse.json(
          { error: "Gmail authentication failed", detail: err instanceof Error ? err.message : String(err) },
          { status: 401 }
        );
      }

      const batchIds = messageIds.slice(state.cursor, state.cursor + BATCH_SIZE);

      // Fetch messages sequentially with delay to avoid 429
      const rawMessages = await fetchMessagesSequentially(gmailClient, batchIds);

      // If nothing came back (all failed), still advance cursor to avoid infinite loop
      if (!rawMessages || rawMessages.length === 0) {
        console.warn("[scan] Batch returned 0 messages, advancing cursor past", batchIds.length, "IDs");
        const newCursor = state.cursor + batchIds.length;
        const updatedState: ScanState = { ...state, cursor: newCursor };
        await supabase
          .from("gmail_accounts")
          .update({ scan_state: updatedState, updated_at: new Date().toISOString() })
          .eq("id", gmailAccount.id);

        if (newCursor >= total) {
          return finalize(supabase, supabaseUserId, gmailAccount.id, updatedState, total);
        }

        return NextResponse.json({
          stage:            "processing",
          emailsScanned:    newCursor,
          emailsTotal:      total,
          sendersFound:     state.sendersFound,
          clutterDetected:  state.clutterDetected,
          protectedSenders: state.protectedSenders,
          message:          `Analyzed ${newCursor.toLocaleString()} of ${total.toLocaleString()} emails…`,
        } satisfies ScanProgress);
      }

      // ── Pass 1: Parse all messages + aggregate sender stats ──────────
      const normalizedMessages = rawMessages.map(parseMessage);
      const batchSenders       = aggregateBatchSenders(normalizedMessages);
      const senderEmails       = [...batchSenders.keys()].filter(e => e !== "" && e !== "__unknown__");

      // Fetch existing sender rows from DB for merge
      let existingSenderMap = new Map<string, DbSenderRow>();
      if (senderEmails.length > 0) {
        const { data: existingSenders } = await supabase
          .from("senders")
          .select("id, sender_email, message_count, open_count, reply_count, archive_count, restore_count, click_count, search_count, learned_state, first_seen_at, last_seen_at, importance_score, clutter_score")
          .eq("user_id", supabaseUserId)
          .in("sender_email", senderEmails) as unknown as {
            data: DbSenderRow[] | null;
          };
        if (existingSenders) {
          existingSenderMap = new Map(existingSenders.map(s => [s.sender_email, s]));
        }
      }

      // Merge batch stats with existing DB stats
      const mergedProfiles = new Map<string, SenderRecord>();
      const senderUpsertRows: Array<Record<string, unknown>> = [];

      for (const [email, batch] of batchSenders) {
        if (!email || email === "__unknown__") continue;
        const existing = existingSenderMap.get(email) ?? null;
        const merged   = mergeSenderStats(existing, batch);
        mergedProfiles.set(email, merged);

        senderUpsertRows.push({
          user_id:          supabaseUserId,
          sender_email:     email,
          sender_name:      batch.sender_name,
          sender_domain:    batch.sender_domain || "",
          first_seen_at:    merged.first_seen_at,
          last_seen_at:     merged.last_seen_at,
          message_count:    merged.message_count,
          open_count:       merged.open_count,
          reply_count:      merged.reply_count,
          archive_count:    merged.archive_count,
          restore_count:    merged.restore_count,
          click_count:      merged.click_count,
          search_count:     merged.search_count,
          learned_state:    merged.learned_state,
          updated_at:       new Date().toISOString(),
        });
      }

      // Upsert senders with merged stats
      for (let i = 0; i < senderUpsertRows.length; i += DB_CHUNK) {
        const chunk = senderUpsertRows.slice(i, i + DB_CHUNK);
        await supabase
          .from("senders")
          .upsert(chunk, { onConflict: "user_id,sender_email" });
      }

      // Fetch sender IDs for FK linking
      const senderIdMap = new Map<string, string>();
      if (senderEmails.length > 0) {
        const { data: senderLookup } = await supabase
          .from("senders")
          .select("id, sender_email")
          .eq("user_id", supabaseUserId)
          .in("sender_email", senderEmails) as unknown as {
            data: Array<{ id: string; sender_email: string }> | null;
          };
        if (senderLookup) {
          for (const s of senderLookup) senderIdMap.set(s.sender_email, s.id);
        }
      }

      // ── Pass 2: Classify using merged sender profiles ─────────────────
      const messageRows: Array<Record<string, unknown>> = [];
      const importanceByEmail = new Map<string, number[]>();
      const clutterByEmail    = new Map<string, number[]>();

      for (const normalized of normalizedMessages) {
        const sEmail       = normalized.sender_email ?? "";
        const senderRecord = mergedProfiles.get(sEmail) ?? buildEmptySenderRecord();
        const features     = extractFeatures(normalized, senderRecord);
        const deterministic = classifyDeterministically(normalized, features);
        const scored        = scoreMessage(normalized, senderRecord, features, deterministic);
        const final         = resolveFinalClassification({
          parsed: normalized, sender: senderRecord,
          deterministic, scored, llmDecision: null,
        });

        // Accumulate scores to update sender averages
        if (sEmail) {
          if (!importanceByEmail.has(sEmail)) importanceByEmail.set(sEmail, []);
          if (!clutterByEmail.has(sEmail))    clutterByEmail.set(sEmail, []);
          importanceByEmail.get(sEmail)!.push(scored.importanceScore);
          clutterByEmail.get(sEmail)!.push(scored.clutterScore);
        }

        messageRows.push({
          user_id:              supabaseUserId,
          sender_id:            senderIdMap.get(sEmail) ?? null,
          gmail_message_id:     normalized.gmail_message_id,
          gmail_thread_id:      normalized.gmail_thread_id,
          gmail_history_id:     normalized.gmail_history_id,
          subject:              normalized.subject,
          snippet:              normalized.snippet,
          body_text:            normalized.body_text,
          body_html:            normalized.body_html,
          internal_date:        normalized.internal_date,
          has_attachments:      normalized.has_attachments,
          is_read:              normalized.is_read,
          is_starred:           normalized.is_starred,
          is_important_label:   normalized.is_important_label,
          gmail_category:       normalized.gmail_category,
          label_ids:            normalized.label_ids,
          has_unsubscribe_header: normalized.has_unsubscribe_header,
          unsubscribe_url:      normalized.unsubscribe_url,
          unsubscribe_mailto:   normalized.unsubscribe_mailto,
          is_newsletter:        normalized.is_newsletter,
          is_promotion:         normalized.is_promotion,
          is_transactional:     normalized.is_transactional,
          is_security_related:  normalized.is_security_related,
          is_personal_like:     normalized.is_personal_like,
          contains_time_sensitive_terms: normalized.contains_time_sensitive_terms,
          deterministic_category: deterministic.category,
          final_category:       final.finalCategory,
          importance_score:     scored.importanceScore,
          clutter_score:        scored.clutterScore,
          risk_score:           scored.riskScore,
          confidence_score:     final.confidenceScore,
          recommended_action:   final.recommendedAction,
          action_reason:        final.reason,
          action_status:        "none",
          review_status:        final.recommendedAction === "review" ? "queued" : "not_needed",
          updated_at:           new Date().toISOString(),
        });
      }

      // Write messages
      for (let i = 0; i < messageRows.length; i += DB_CHUNK) {
        const chunk = messageRows.slice(i, i + DB_CHUNK);
        await supabase
          .from("messages")
          .upsert(chunk, { onConflict: "user_id,gmail_message_id" });
      }

      // Update sender importance/clutter scores from classification results
      for (const [email, scores] of importanceByEmail) {
        const senderId = senderIdMap.get(email);
        if (!senderId || scores.length === 0) continue;
        const clutterScores = clutterByEmail.get(email) ?? [];
        const avgImportance = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const avgClutter    = clutterScores.length > 0
          ? Math.round(clutterScores.reduce((a, b) => a + b, 0) / clutterScores.length)
          : 0;
        await supabase
          .from("senders")
          .update({
            importance_score: avgImportance,
            clutter_score:    avgClutter,
            trust_score:      avgImportance,
            updated_at:       new Date().toISOString(),
          })
          .eq("id", senderId);
      }

      // Update cursor + running stats
      const newCursor = state.cursor + rawMessages.length;

      // Get running totals from DB (accurate across all batches)
      const [clutterRes, senderRes, protectedRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", supabaseUserId)
          .in("final_category", [...CLUTTER_CATEGORIES]),
        supabase
          .from("senders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", supabaseUserId),
        // Count distinct senders with high importance — not messages
        supabase
          .from("senders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", supabaseUserId)
          .gte("importance_score", 65),
      ]);

      const updatedState: ScanState = {
        ...state,
        cursor:           newCursor,
        sendersFound:     senderRes.count ?? state.sendersFound,
        clutterDetected:  clutterRes.count ?? state.clutterDetected,
        protectedSenders: protectedRes.count ?? state.protectedSenders,
      };

      await supabase
        .from("gmail_accounts")
        .update({ scan_state: updatedState, updated_at: new Date().toISOString() })
        .eq("id", gmailAccount.id);

      // Check if we just finished
      if (newCursor >= total) {
        return finalize(supabase, supabaseUserId, gmailAccount.id, updatedState, total);
      }

      const progress: ScanProgress = {
        stage:            "processing",
        emailsScanned:    newCursor,
        emailsTotal:      total,
        sendersFound:     updatedState.sendersFound,
        clutterDetected:  updatedState.clutterDetected,
        protectedSenders: updatedState.protectedSenders,
        message:          `Analyzed ${newCursor.toLocaleString()} of ${total.toLocaleString()} emails…`,
      };

      return NextResponse.json(progress);
    }

    // ── Phase 3: Already done (cursor >= total) ──────────────────────────
    return finalize(supabase, supabaseUserId, gmailAccount.id, state, total);

  } catch (err) {
    console.error("[scan] error:", err);
    const ss = gmailAccount.scan_state;
    const progress: ScanProgress = {
      stage:            "error",
      emailsScanned:    ss?.cursor ?? 0,
      emailsTotal:      Array.isArray(ss?.messageIds) ? ss.messageIds.length : 0,
      sendersFound:     ss?.sendersFound ?? 0,
      clutterDetected:  ss?.clutterDetected ?? 0,
      protectedSenders: ss?.protectedSenders ?? 0,
      message:          err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
    return NextResponse.json(progress, { status: 500 });
  }
}

// Also support GET for backwards compat — redirect to POST behavior
export async function GET() {
  return NextResponse.json(
    { error: "Use POST to poll scan progress" },
    { status: 405 }
  );
}

// ---------------------------------------------------------------------------
// Finalize — mark scan complete, clear scan_state
// ---------------------------------------------------------------------------

async function finalize(
  supabase: ReturnType<typeof createAdminClient>,
  supabaseUserId: string,
  gmailAccountId: string,
  state: ScanState,
  total: number,
) {
  await Promise.all([
    supabase
      .from("gmail_accounts")
      .update({
        scan_state:        null,
        sync_status:       "synced",
        last_full_sync_at: new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      })
      .eq("id", gmailAccountId),
    supabase
      .from("users")
      .update({
        onboarding_status: "initial_scan_complete",
        updated_at:        new Date().toISOString(),
      })
      .eq("id", supabaseUserId),
  ]);

  const progress: ScanProgress = {
    stage:            "complete",
    emailsScanned:    total,
    emailsTotal:      total,
    sendersFound:     state.sendersFound,
    clutterDetected:  state.clutterDetected,
    protectedSenders: state.protectedSenders,
    message:          "Your inbox is ready.",
  };

  return NextResponse.json(progress);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gmailDateString(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 86400_000);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function listIds(
  client: Awaited<ReturnType<typeof createGmailClient>>,
  q: string,
  limit: number,
  seen: Set<string>,
  out: string[]
): Promise<void> {
  let pageToken: string | undefined;
  while (seen.size < limit) {
    const params: Record<string, string> = {
      q,
      maxResults: String(Math.min(500, limit - seen.size)),
    };
    if (pageToken) params.pageToken = pageToken;

    let data;
    try {
      data = await client.listMessages(params);
    } catch (err) {
      console.error("[scan] listMessages failed:", err);
      break; // stop listing, work with what we have
    }

    if (!data) break;

    const messages = data.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) break;

    for (const msg of messages) {
      if (msg?.id && !seen.has(msg.id)) {
        seen.add(msg.id);
        out.push(msg.id);
      }
      if (seen.size >= limit) break;
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
}

/**
 * Fetch messages one at a time with a delay between each to avoid 429.
 * Retries individual failures with exponential backoff.
 */
async function fetchMessagesSequentially(
  client: Awaited<ReturnType<typeof createGmailClient>>,
  ids: string[]
): Promise<Array<Awaited<ReturnType<typeof client.getMessage>>>> {
  const results: Array<Awaited<ReturnType<typeof client.getMessage>>> = [];

  for (let i = 0; i < ids.length; i++) {
    let attempt = 0;
    let backoff = INITIAL_BACKOFF;

    while (true) {
      try {
        const msg = await client.getMessage(ids[i]);
        results.push(msg);
        break;
      } catch (err: unknown) {
        const is429 =
          err instanceof Error &&
          (err.message.includes("429") ||
           err.message.toLowerCase().includes("rate limit") ||
           err.message.toLowerCase().includes("too many"));

        if (is429 && attempt < MAX_RETRIES) {
          attempt++;
          console.warn(`[scan] 429 on ${ids[i]}, retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`);
          await sleep(backoff);
          backoff *= 2;
          continue;
        }
        // Skip this message on non-retryable errors
        console.warn(`[scan] skipping message ${ids[i]}:`, err);
        break;
      }
    }

    // Delay between fetches (skip after last)
    if (i < ids.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  return results;
}

function buildEmptySenderRecord(): SenderRecord {
  return {
    message_count: 0,
    open_count:    0,
    reply_count:   0,
    archive_count: 0,
    restore_count: 0,
    click_count:   0,
    search_count:  0,
    last_seen_at:  null,
    learned_state: "unknown",
  };
}

// ---------------------------------------------------------------------------
// Two-pass scan helpers
// ---------------------------------------------------------------------------

interface SenderAggregate {
  sender_email:  string;
  sender_name:   string | null;
  sender_domain: string;
  first_seen_at: string | null;
  last_seen_at:  string | null;
  message_count: number;
  open_count:    number;
  reply_count:   number;
}

interface DbSenderRow {
  id:               string;
  sender_email:     string;
  message_count:    number;
  open_count:       number;
  reply_count:      number;
  archive_count:    number;
  restore_count:    number;
  click_count:      number;
  search_count:     number;
  learned_state:    string;
  first_seen_at:    string | null;
  last_seen_at:     string | null;
  importance_score: number;
  clutter_score:    number;
}

function aggregateBatchSenders(messages: NormalizedMessage[]): Map<string, SenderAggregate> {
  const map = new Map<string, SenderAggregate>();

  for (const msg of messages) {
    const email = msg.sender_email ?? "";
    if (!email) continue;

    const existing = map.get(email) ?? {
      sender_email:  email,
      sender_name:   msg.sender_name ?? null,
      sender_domain: msg.sender_domain ?? "",
      first_seen_at: msg.internal_date ?? null,
      last_seen_at:  msg.internal_date ?? null,
      message_count: 0,
      open_count:    0,
      reply_count:   0,
    };

    existing.message_count += 1;
    if (msg.is_read) existing.open_count += 1;

    if (msg.internal_date && (!existing.first_seen_at || msg.internal_date < existing.first_seen_at)) {
      existing.first_seen_at = msg.internal_date;
    }
    if (msg.internal_date && (!existing.last_seen_at || msg.internal_date > existing.last_seen_at)) {
      existing.last_seen_at = msg.internal_date;
    }

    map.set(email, existing);
  }

  return map;
}

function mergeSenderStats(
  existing: DbSenderRow | null,
  batch: SenderAggregate
): SenderRecord & { first_seen_at: string | null; last_seen_at: string | null } {
  const merged = {
    message_count:  (existing?.message_count ?? 0) + batch.message_count,
    open_count:     (existing?.open_count    ?? 0) + batch.open_count,
    reply_count:    (existing?.reply_count   ?? 0) + batch.reply_count,
    archive_count:  existing?.archive_count  ?? 0,
    restore_count:  existing?.restore_count  ?? 0,
    click_count:    existing?.click_count    ?? 0,
    search_count:   existing?.search_count   ?? 0,
    learned_state:  existing?.learned_state  ?? "unknown",
    last_seen_at:   batch.last_seen_at ?? existing?.last_seen_at ?? null,
    first_seen_at:  existing?.first_seen_at ?? batch.first_seen_at,
  };
  return merged;
}
