import { createAdminClient }  from "@/lib/supabase/admin";
import { createGmailClient }  from "@/lib/gmail/client";
import { parseMessage }        from "@/lib/gmail/parser";
import type { NormalizedMessage, GmailMessage } from "@/lib/gmail/types";

// ---------------------------------------------------------------------------
// Gmail History API types
// ---------------------------------------------------------------------------

interface GmailHistoryMessage {
  id:        string;
  threadId:  string;
  labelIds?: string[];
}

interface GmailHistoryItem {
  id:             string;
  messagesAdded?: { message: GmailHistoryMessage }[];
}

interface GmailHistoryResponse {
  history?:      GmailHistoryItem[];
  historyId:     string;
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// syncIncrementalMessages
//
// Uses Gmail's History API to fetch only messages added since the last sync.
// Stores the new historyId after each run so subsequent calls are incremental.
//
// Fallback: if no historyId is stored (first run after initial sync) or if
// Gmail returns 404 (history expired / too old), falls back to the list API
// for the past FALLBACK_HOURS hours.
//
// Only returns messages that currently carry the INBOX label — archived or
// already-categorised mail is skipped. Messages already stored in our DB
// (looked up by gmail_message_id) are also skipped.
// ---------------------------------------------------------------------------

const FALLBACK_HOURS   = 48;   // how far back to look on history miss
const FETCH_BATCH_SIZE = 4;    // parallel full-message fetches
const FETCH_DELAY_MS   = 250;  // ms between fetch batches
const MAX_RETRIES      = 4;
const INITIAL_BACKOFF  = 1000; // ms, doubles on each retry

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  gmail: Awaited<ReturnType<typeof createGmailClient>>,
  id: string
): ReturnType<typeof gmail.getMessage> {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF;

  while (true) {
    try {
      return await gmail.getMessage(id);
    } catch (err: unknown) {
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") ||
         err.message.toLowerCase().includes("rate limit") ||
         err.message.toLowerCase().includes("too many"));

      if (is429 && attempt < MAX_RETRIES) {
        attempt++;
        console.warn(
          `[history] 429 on message ${id}, retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`
        );
        await sleep(backoff);
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
}

export async function syncIncrementalMessages(
  supabaseUserId: string
): Promise<NormalizedMessage[]> {
  const supabase = createAdminClient();

  // ── Fetch Gmail account record ───────────────────────────────────────────
  type AccountRow = {
    history_id: string | null;
  };

  const { data: account } = await supabase
    .from("gmail_accounts")
    .select("history_id")
    .eq("user_id", supabaseUserId)
    .single() as unknown as { data: AccountRow | null };

  if (!account) {
    throw new Error(`[history] no gmail_account found for user ${supabaseUserId}`);
  }

  const gmail = await createGmailClient(supabaseUserId);
  const storedHistoryId = account.history_id;

  // ── Collect new message IDs ───────────────────────────────────────────────
  let newMessageIds: string[];
  let latestHistoryId: string;

  if (!storedHistoryId) {
    // No history_id stored — do a short list-based fallback
    ({ messageIds: newMessageIds, historyId: latestHistoryId } =
      await listFallback(gmail, supabaseUserId));
  } else {
    try {
      ({ messageIds: newMessageIds, historyId: latestHistoryId } =
        await fetchHistory(gmail, storedHistoryId));
    } catch (err) {
      // History expired (404) — fall back to list API
      console.warn("[history] historyId expired, falling back to list:", err);
      ({ messageIds: newMessageIds, historyId: latestHistoryId } =
        await listFallback(gmail, supabaseUserId));
    }
  }

  // ── Persist new historyId immediately ────────────────────────────────────
  await supabase
    .from("gmail_accounts")
    .update({
      history_id:                latestHistoryId,
      last_incremental_sync_at:  new Date().toISOString(),
      updated_at:                new Date().toISOString(),
    })
    .eq("user_id", supabaseUserId);

  if (newMessageIds.length === 0) return [];

  // ── Filter out already-known messages ────────────────────────────────────
  type MsgRow = { gmail_message_id: string };

  const { data: existing } = await supabase
    .from("messages")
    .select("gmail_message_id")
    .eq("user_id", supabaseUserId)
    .in("gmail_message_id", newMessageIds) as unknown as { data: MsgRow[] | null };

  const knownIds = new Set((existing ?? []).map(m => m.gmail_message_id));
  const toFetch  = newMessageIds.filter(id => !knownIds.has(id));

  if (toFetch.length === 0) return [];

  // ── Fetch full message objects in parallel batches ───────────────────────
  const fullMessages: GmailMessage[] = [];

  for (let i = 0; i < toFetch.length; i += FETCH_BATCH_SIZE) {
    const batch = toFetch.slice(i, i + FETCH_BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(id => fetchWithRetry(gmail, id).catch(err => {
        console.warn(`[history] failed to fetch message ${id}:`, err);
        return null;
      }))
    );
    for (const msg of fetched) {
      if (msg) fullMessages.push(msg);
    }

    // Delay between sub-batches
    if (i + FETCH_BATCH_SIZE < toFetch.length) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  // ── Parse and return ──────────────────────────────────────────────────────
  return fullMessages.map(parseMessage);
}

// ---------------------------------------------------------------------------
// fetchHistory — pages through History API collecting inbox additions
// ---------------------------------------------------------------------------

async function fetchHistory(
  gmail: Awaited<ReturnType<typeof createGmailClient>>,
  startHistoryId: string
): Promise<{ messageIds: string[]; historyId: string }> {
  const messageIds = new Set<string>();
  let latestHistoryId = startHistoryId;
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      startHistoryId,
      historyTypes: "messageAdded",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await gmail.get<GmailHistoryResponse>(
      "/gmail/v1/users/me/history",
      params
    );

    latestHistoryId = data.historyId;

    for (const item of data.history ?? []) {
      for (const added of item.messagesAdded ?? []) {
        const msg = added.message;
        // Only process messages currently in INBOX
        if (msg.labelIds?.includes("INBOX")) {
          messageIds.add(msg.id);
        }
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { messageIds: [...messageIds], historyId: latestHistoryId };
}

// ---------------------------------------------------------------------------
// listFallback — list-based sync when no history_id is available
// ---------------------------------------------------------------------------

async function listFallback(
  gmail: Awaited<ReturnType<typeof createGmailClient>>,
  supabaseUserId: string
): Promise<{ messageIds: string[]; historyId: string }> {
  // Compute date filter (Gmail query format: YYYY/MM/DD)
  const since = new Date(Date.now() - FALLBACK_HOURS * 3_600_000);
  const afterStr = [
    since.getFullYear(),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ].join("/");

  // List INBOX messages since the cutoff
  const listRes = await gmail.listMessages({
    q:          `in:inbox after:${afterStr}`,
    maxResults: "100",
  });

  const messageIds = (listRes.messages ?? []).map(m => m.id);

  // We also need the current historyId — fetch profile to get it
  const profile = await gmail.get<{ historyId: string }>(
    "/gmail/v1/users/me/profile"
  );

  void supabaseUserId; // used by caller to persist
  return { messageIds, historyId: profile.historyId };
}
