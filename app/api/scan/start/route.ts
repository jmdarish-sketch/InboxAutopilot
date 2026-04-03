import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGmailClient } from "@/lib/gmail/client";
import { parseMessage } from "@/lib/gmail/parser";
import { extractFeatures, type SenderRecord } from "@/lib/classification/features";
import { classifyDeterministically } from "@/lib/classification/rules";
import { scoreMessage } from "@/lib/classification/scorer";
import { resolveFinalClassification } from "@/lib/classification/final-decision";
import type { NormalizedMessage } from "@/lib/gmail/types";
import type { DeterministicResult } from "@/lib/classification/rules";
import type { ScoredResult } from "@/lib/classification/scorer";
import type { FinalDecision } from "@/lib/classification/final-decision";

export const dynamic    = "force-dynamic";
export const maxDuration = 300; // up to 5 min on Vercel Pro

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanProgress {
  stage: "connecting" | "fetching" | "processing" | "saving" | "complete";
  emailsScanned: number;
  emailsTotal:   number;
  sendersFound:  number;
  clutterDetected: number;
  protectedSenders: number;
  message: string;
}

type InMemorySender = {
  sender_email:  string;
  sender_name:   string | null;
  sender_domain: string | null;
  firstSeen:     string | null;
  lastSeen:      string | null;
  messageCount:  number;
  importanceTotal: number;
  clutterTotal:    number;
  hasImportantMessage: boolean;
};

type ProcessedMessage = {
  normalized:    NormalizedMessage;
  deterministic: DeterministicResult;
  scored:        ScoredResult;
  final:         FinalDecision;
};

const CLUTTER_CATEGORIES  = new Set(["promotion", "newsletter", "recurring_low_value", "spam_like"]);
const IMPORTANT_CATEGORIES = new Set(["critical_transactional", "work_school", "personal_human"]);
const FETCH_BATCH   = 4;   // messages fetched from Gmail concurrently (avoid 429)
const FETCH_DELAY   = 250; // ms between fetch batches
const PROCESS_BATCH = 50;  // messages classified per SSE tick
const DB_CHUNK      = 200; // rows per Supabase upsert call
const MAX_RETRIES   = 4;   // retries on 429
const INITIAL_BACKOFF = 1000; // ms, doubles on each retry

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------

function sseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder:    TextEncoder,
  event:      string,
  data:       unknown
) {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

// ---------------------------------------------------------------------------
// GET /api/scan/start
// ---------------------------------------------------------------------------

export async function GET() {
  const encoder = new TextEncoder();

  // Resolve auth before the stream opens — we need the user before any async work
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);

  if (!userId || !clerkUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!clerkEmail) {
    return new Response("No email on Clerk account", { status: 400 });
  }

  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        sseEvent(controller, encoder, event, data);

      const progress: ScanProgress = {
        stage: "connecting",
        emailsScanned:    0,
        emailsTotal:      0,
        sendersFound:     0,
        clutterDetected:  0,
        protectedSenders: 0,
        message: "Connecting to Gmail…",
      };

      try {
        // ── Phase 1: resolve Supabase user ──────────────────────────────────
        send("progress", progress);

        const supabase = createAdminClient();

        const { data: userRow, error: userErr } = await supabase
          .from("users")
          .select("id")
          .eq("email", clerkEmail)
          .single();

        if (userErr || !userRow) {
          send("error", { message: "Account not found. Please reconnect Gmail." });
          controller.close();
          return;
        }

        const supabaseUserId = userRow.id as string;

        // ── Phase 2: create Gmail client ─────────────────────────────────────
        const gmailClient = await createGmailClient(supabaseUserId);

        // ── Phase 3: list message IDs ────────────────────────────────────────
        progress.stage   = "fetching";
        progress.message = "Scanning your inbox…";
        send("progress", progress);

        // Replicate the two-pass list logic from sync.ts so we can report
        // the total before we start downloading bodies.
        const afterDate = gmailDateString(120);
        const seen      = new Set<string>();
        const allIds: string[] = [];

        await listIds(gmailClient, `in:inbox after:${afterDate}`, 5000, seen, allIds);
        await listIds(gmailClient, `category:promotions after:${afterDate}`, 5000, seen, allIds);

        const total = Math.min(allIds.length, 5000);
        progress.emailsTotal = total;
        progress.message     = `Found ${total.toLocaleString()} emails — analyzing…`;
        send("progress", progress);

        if (cancelled) { controller.close(); return; }

        // ── Phase 4: fetch full messages + classify in batches ───────────────
        progress.stage = "processing";

        const senders  = new Map<string, InMemorySender>();
        const results: ProcessedMessage[] = [];

        for (let i = 0; i < total; i += PROCESS_BATCH) {
          if (cancelled) break;

          const batchIds = allIds.slice(i, i + PROCESS_BATCH);

          // Fetch messages in small sub-batches to avoid Gmail 429 errors
          const rawBatch = await fetchMessagesThrottled(
            gmailClient, batchIds, FETCH_BATCH, FETCH_DELAY
          );

          for (const raw of rawBatch) {
            const normalized = parseMessage(raw);
            const senderKey  = normalized.sender_email ?? "__unknown__";

            // Build or reuse an in-memory sender record
            if (!senders.has(senderKey)) {
              senders.set(senderKey, {
                sender_email:  normalized.sender_email  ?? "",
                sender_name:   normalized.sender_name,
                sender_domain: normalized.sender_domain,
                firstSeen:     normalized.internal_date,
                lastSeen:      normalized.internal_date,
                messageCount:  0,
                importanceTotal: 0,
                clutterTotal:    0,
                hasImportantMessage: false,
              });
            }

            const s = senders.get(senderKey)!;
            s.messageCount++;
            if (
              normalized.internal_date &&
              (!s.firstSeen || normalized.internal_date < s.firstSeen)
            ) s.firstSeen = normalized.internal_date;
            if (
              normalized.internal_date &&
              (!s.lastSeen || normalized.internal_date > s.lastSeen)
            ) s.lastSeen  = normalized.internal_date;

            // Classification (no LLM during scan — speed is the priority)
            const senderRecord = buildSenderRecord(s);
            const features     = extractFeatures(normalized, senderRecord);
            const deterministic = classifyDeterministically(normalized, features);
            const scored        = scoreMessage(normalized, senderRecord, features, deterministic);
            const final         = resolveFinalClassification({
              parsed: normalized, sender: senderRecord,
              deterministic, scored, llmDecision: null,
            });

            s.importanceTotal += scored.importanceScore;
            s.clutterTotal    += scored.clutterScore;
            if (IMPORTANT_CATEGORIES.has(final.finalCategory)) {
              s.hasImportantMessage = true;
            }

            results.push({ normalized, deterministic, scored, final });

            // Stats
            progress.emailsScanned++;
            progress.sendersFound    = senders.size;
            progress.clutterDetected = results.filter(
              (r) => CLUTTER_CATEGORIES.has(r.final.finalCategory)
            ).length;
            progress.protectedSenders = [...senders.values()].filter(
              (s) => s.hasImportantMessage
            ).length;
          }

          progress.message = `Analyzed ${progress.emailsScanned.toLocaleString()} of ${total.toLocaleString()} emails…`;
          send("progress", progress);
        }

        if (cancelled) { controller.close(); return; }

        // ── Phase 5: write to database ───────────────────────────────────────
        progress.stage   = "saving";
        progress.message = "Saving your clean inbox…";
        send("progress", progress);

        // 5a. Upsert senders, collect id → sender_email map
        const senderRows = [...senders.values()].map((s) => ({
          user_id:        supabaseUserId,
          sender_email:   s.sender_email,
          sender_name:    s.sender_name,
          sender_domain:  s.sender_domain ?? "",
          first_seen_at:  s.firstSeen,
          last_seen_at:   s.lastSeen,
          message_count:  s.messageCount,
          importance_score: s.messageCount > 0
            ? Math.round(s.importanceTotal / s.messageCount)
            : 0,
          clutter_score: s.messageCount > 0
            ? Math.round(s.clutterTotal / s.messageCount)
            : 0,
          learned_state:  "unknown",
          updated_at:     new Date().toISOString(),
        }));

        const emailToSenderId = new Map<string, string>();

        for (let i = 0; i < senderRows.length; i += DB_CHUNK) {
          const chunk = senderRows.slice(i, i + DB_CHUNK);
          const { data, error } = await supabase
            .from("senders")
            .upsert(chunk, { onConflict: "user_id,sender_email" })
            .select("id, sender_email");

          if (error) {
            console.error("[scan] sender upsert error:", error);
          } else {
            for (const row of data ?? []) {
              emailToSenderId.set(row.sender_email as string, row.id as string);
            }
          }
        }

        // 5b. Upsert messages
        const messageRows = results.map(({ normalized: n, deterministic: d, scored: s, final: f }) => ({
          user_id:              supabaseUserId,
          sender_id:            n.sender_email
            ? (emailToSenderId.get(n.sender_email) ?? null)
            : null,
          gmail_message_id:     n.gmail_message_id,
          gmail_thread_id:      n.gmail_thread_id,
          gmail_history_id:     n.gmail_history_id,
          subject:              n.subject,
          snippet:              n.snippet,
          body_text:            n.body_text,
          body_html:            n.body_html,
          internal_date:        n.internal_date,
          has_attachments:      n.has_attachments,
          is_read:              n.is_read,
          is_starred:           n.is_starred,
          is_important_label:   n.is_important_label,
          gmail_category:       n.gmail_category,
          label_ids:            n.label_ids,
          has_unsubscribe_header: n.has_unsubscribe_header,
          unsubscribe_url:      n.unsubscribe_url,
          unsubscribe_mailto:   n.unsubscribe_mailto,
          is_newsletter:        n.is_newsletter,
          is_promotion:         n.is_promotion,
          is_transactional:     n.is_transactional,
          is_security_related:  n.is_security_related,
          is_personal_like:     n.is_personal_like,
          contains_time_sensitive_terms: n.contains_time_sensitive_terms,
          deterministic_category: d.category,
          final_category:       f.finalCategory,
          importance_score:     s.importanceScore,
          clutter_score:        s.clutterScore,
          risk_score:           s.riskScore,
          confidence_score:     f.confidenceScore,
          recommended_action:   f.recommendedAction,
          action_reason:        f.reason,
          action_status:        "none",
          review_status:        f.recommendedAction === "review" ? "queued" : "not_needed",
          updated_at:           new Date().toISOString(),
        }));

        for (let i = 0; i < messageRows.length; i += DB_CHUNK) {
          const chunk = messageRows.slice(i, i + DB_CHUNK);
          const { error } = await supabase
            .from("messages")
            .upsert(chunk, { onConflict: "user_id,gmail_message_id" });
          if (error) console.error("[scan] message upsert error:", error);
        }

        // 5c. Mark sync complete
        await supabase
          .from("gmail_accounts")
          .update({
            sync_status: "synced",
            last_full_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", supabaseUserId);

        await supabase
          .from("users")
          .update({
            onboarding_status: "initial_scan_complete",
            updated_at: new Date().toISOString(),
          })
          .eq("id", supabaseUserId);

        // ── Phase 6: done ────────────────────────────────────────────────────
        progress.stage   = "complete";
        progress.message = "Your inbox is ready.";
        send("complete", progress);
      } catch (err) {
        console.error("[scan] fatal error:", err);
        send("error", {
          message:
            err instanceof Error ? err.message : "Something went wrong. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":     "text/event-stream",
      "Cache-Control":    "no-cache, no-transform",
      "Connection":       "keep-alive",
      "X-Accel-Buffering":"no", // disable nginx / Vercel edge buffering
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    const data = await client.listMessages(params);
    for (const msg of data.messages ?? []) {
      if (!seen.has(msg.id)) { seen.add(msg.id); out.push(msg.id); }
      if (seen.size >= limit) break;
    }
    if (!data.nextPageToken || !data.messages?.length) break;
    pageToken = data.nextPageToken;
  }
}

/**
 * Fetch a single message with exponential backoff retry on 429 errors.
 */
async function fetchWithRetry(
  client: Awaited<ReturnType<typeof createGmailClient>>,
  messageId: string
): Promise<ReturnType<typeof client.getMessage>> {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF;

  while (true) {
    try {
      return await client.getMessage(messageId);
    } catch (err: unknown) {
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") ||
         err.message.toLowerCase().includes("rate limit") ||
         err.message.toLowerCase().includes("too many"));

      if (is429 && attempt < MAX_RETRIES) {
        attempt++;
        console.warn(
          `[scan] 429 on message ${messageId}, retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`
        );
        await sleep(backoff);
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Fetch an array of message IDs in small sub-batches with a delay between
 * each batch to stay under Gmail's per-user rate limit.
 */
async function fetchMessagesThrottled(
  client: Awaited<ReturnType<typeof createGmailClient>>,
  ids: string[],
  batchSize: number,
  delayMs: number
): Promise<Array<Awaited<ReturnType<typeof client.getMessage>>>> {
  const results: Array<Awaited<ReturnType<typeof client.getMessage>>> = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const fetched = await Promise.all(
      chunk.map((id) => fetchWithRetry(client, id))
    );
    results.push(...fetched);

    // Delay between sub-batches (skip after the last one)
    if (i + batchSize < ids.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSenderRecord(s: InMemorySender): SenderRecord {
  return {
    message_count:  s.messageCount,
    open_count:     0,
    reply_count:    0,
    archive_count:  0,
    restore_count:  0,
    click_count:    0,
    search_count:   0,
    last_seen_at:   s.lastSeen,
    learned_state:  "unknown",
  };
}
