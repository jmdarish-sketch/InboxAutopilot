import { createAdminClient } from "@/lib/supabase/admin";
import { createGmailClient } from "./client";

/**
 * Archives a list of Gmail messages by removing the INBOX label.
 * Uses batchModify for efficiency (up to 1000 per request).
 */
export async function archiveGmailMessages(
  supabaseUserId: string,
  gmailMessageIds: string[]
): Promise<void> {
  if (gmailMessageIds.length === 0) return;
  const client = await createGmailClient(supabaseUserId);
  await client.batchModifyLabels(gmailMessageIds, undefined, ["INBOX"]);
}

export interface UnsubscribeResult {
  attempted: boolean;
  method:    "url" | "mailto" | "none";
  success:   boolean;
}

/**
 * Attempts an RFC 8058 one-click unsubscribe for a sender.
 * Tries URL-based unsubscribe first, reports method used in result.
 *
 * Does NOT support mailto: unsubscribe (would require sending email).
 * Returns structured result so callers can log the method honestly.
 */
export async function attemptUnsubscribe(
  supabaseUserId: string,
  senderId: string
): Promise<UnsubscribeResult> {
  const supabase = createAdminClient();

  const { data: msg } = await supabase
    .from("messages")
    .select("unsubscribe_url, unsubscribe_mailto")
    .eq("user_id", supabaseUserId)
    .eq("sender_id", senderId)
    .not("unsubscribe_url", "is", null)
    .limit(1)
    .maybeSingle();

  // Try URL-based one-click unsubscribe
  if (msg?.unsubscribe_url) {
    try {
      const res = await fetch(msg.unsubscribe_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        signal: AbortSignal.timeout(10_000),
      });
      return { attempted: true, method: "url", success: res.status < 500 };
    } catch {
      return { attempted: true, method: "url", success: false };
    }
  }

  // Check if mailto-only unsubscribe exists (we can't act on it, but report it)
  if (!msg) {
    const { data: mailtoMsg } = await supabase
      .from("messages")
      .select("unsubscribe_mailto")
      .eq("user_id", supabaseUserId)
      .eq("sender_id", senderId)
      .not("unsubscribe_mailto", "is", null)
      .limit(1)
      .maybeSingle();

    if (mailtoMsg?.unsubscribe_mailto) {
      return { attempted: false, method: "mailto", success: false };
    }
  }

  return { attempted: false, method: "none", success: false };
}

// ---------------------------------------------------------------------------
// Gmail Filter Creation
// ---------------------------------------------------------------------------

export interface FilterResult {
  created:  boolean;
  filterId: string | null;
  error?:   string;
}

/**
 * Creates a real Gmail server-side filter that auto-archives all future
 * emails from the given sender address.
 *
 * POST /gmail/v1/users/me/settings/filters
 * { criteria: { from: senderEmail }, action: { removeLabelIds: ["INBOX"] } }
 *
 * This is the preventative layer — once a filter exists, Gmail itself
 * handles the archiving before the message ever hits the inbox.
 */
export async function createGmailFilter(
  supabaseUserId: string,
  senderEmail: string
): Promise<FilterResult> {
  try {
    const client = await createGmailClient(supabaseUserId);

    const result = await client.post<{ id?: string }>(
      "/gmail/v1/users/me/settings/filters",
      {
        criteria: { from: senderEmail },
        action:   { removeLabelIds: ["INBOX"] },
      }
    );

    return { created: true, filterId: result?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Gmail returns 409 if a duplicate filter already exists — that's fine
    if (message.includes("409") || message.toLowerCase().includes("already exists")) {
      return { created: true, filterId: null, error: "duplicate_filter" };
    }

    console.error(`[gmail] filter creation failed for ${senderEmail}:`, message);
    return { created: false, filterId: null, error: message };
  }
}
