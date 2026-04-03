import type { GmailClient } from "./client";
import type { GmailMessage, GmailMessageListItem } from "./types";

export interface FetchOptions {
  /** How many days back to fetch. Default: 120 */
  daysBack?: number;
  /** Hard cap on total messages returned. Default: 5000 */
  maxMessages?: number;
  /** How many messages to fetch in parallel per batch. Default: 10 */
  batchSize?: number;
}

// Gmail API allows up to 500 per page
const PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches up to `maxMessages` Gmail messages from the last `daysBack` days,
 * covering both INBOX and CATEGORY_PROMOTIONS (including archived promotions).
 *
 * Returns fully hydrated GmailMessage objects ready for the parser.
 */
export async function fetchInitialMessages(
  client: GmailClient,
  options: FetchOptions = {}
): Promise<GmailMessage[]> {
  const { daysBack = 120, maxMessages = 5000, batchSize = 4 } = options;

  const afterDate = gmailDateString(daysBack);

  // Two passes — deduplicated by ID so overlapping messages aren't fetched twice.
  // Pass 1: everything in INBOX (Primary, Social, Promotions, Updates tabs).
  // Pass 2: CATEGORY_PROMOTIONS specifically, to catch archived promo emails
  //         that no longer carry the INBOX label.
  const seen = new Set<string>();
  const collected: GmailMessageListItem[] = [];

  await listAllIds(
    client,
    `in:inbox after:${afterDate}`,
    maxMessages,
    seen,
    collected
  );

  await listAllIds(
    client,
    `category:promotions after:${afterDate}`,
    maxMessages,
    seen,
    collected
  );

  if (collected.length === 0) return [];

  const ids = collected.slice(0, maxMessages).map((m) => m.id);
  return fetchInBatches(client, ids, batchSize);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Paginates through `messages.list` and appends unique IDs to `collected`.
 * Stops early once `seen` reaches `limit`.
 */
async function listAllIds(
  client: GmailClient,
  q: string,
  limit: number,
  seen: Set<string>,
  collected: GmailMessageListItem[]
): Promise<void> {
  let pageToken: string | undefined;

  while (seen.size < limit) {
    const remaining = limit - seen.size;
    const params: Record<string, string> = {
      q,
      maxResults: String(Math.min(PAGE_SIZE, remaining)),
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await client.listMessages(params);

    if (data.messages) {
      for (const msg of data.messages) {
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          collected.push(msg);
        }
        if (seen.size >= limit) break;
      }
    }

    if (!data.nextPageToken || !data.messages?.length) break;
    pageToken = data.nextPageToken;
  }
}

const FETCH_DELAY_MS   = 250;
const MAX_RETRIES      = 4;
const INITIAL_BACKOFF  = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single message with exponential backoff retry on 429 errors.
 */
async function fetchWithRetry(
  client: GmailClient,
  id: string
): Promise<GmailMessage> {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF;

  while (true) {
    try {
      return await client.getMessage(id);
    } catch (err: unknown) {
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") ||
         err.message.toLowerCase().includes("rate limit") ||
         err.message.toLowerCase().includes("too many"));

      if (is429 && attempt < MAX_RETRIES) {
        attempt++;
        console.warn(
          `[gmail/sync] 429 on message ${id}, retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`
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
 * Fetches full GmailMessage objects in small batches with a delay between
 * each batch and retry logic on 429 errors.
 */
async function fetchInBatches(
  client: GmailClient,
  ids: string[],
  batchSize: number
): Promise<GmailMessage[]> {
  const results: GmailMessage[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const messages = await Promise.all(
      batch.map((id) => fetchWithRetry(client, id))
    );
    results.push(...messages);

    // Delay between sub-batches (skip after the last one)
    if (i + batchSize < ids.length) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  return results;
}

/**
 * Returns a Gmail query date string (YYYY/MM/DD) for `daysBack` days ago.
 */
function gmailDateString(daysBack: number): string {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
