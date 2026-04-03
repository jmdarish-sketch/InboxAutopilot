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

/**
 * Attempts an RFC 8058 one-click unsubscribe for a sender.
 * Looks up the unsubscribe URL from the first matching message in the DB.
 * Returns true if the request was sent (not necessarily successful).
 */
export async function attemptUnsubscribe(
  supabaseUserId: string,
  senderId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: msg } = await supabase
    .from("messages")
    .select("unsubscribe_url, unsubscribe_mailto")
    .eq("user_id", supabaseUserId)
    .eq("sender_id", senderId)
    .not("unsubscribe_url", "is", null)
    .limit(1)
    .maybeSingle();

  if (!msg?.unsubscribe_url) return false;

  try {
    // RFC 8058: POST with application/x-www-form-urlencoded body
    const res = await fetch(msg.unsubscribe_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      signal: AbortSignal.timeout(10_000),
    });
    // Treat any non-5xx response as "attempted"
    return res.status < 500;
  } catch {
    return false;
  }
}
