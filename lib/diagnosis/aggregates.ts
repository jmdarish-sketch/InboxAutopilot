import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Recomputes sender-level aggregate scores from the messages table.
 *
 * The initial scan writes approximate values (averaged from in-memory state).
 * This function reads back the actual stored per-message scores and produces
 * accurate per-sender averages, plus open_count from Gmail's is_read flag
 * as the best available proxy before real engagement tracking starts.
 */
export async function updateSenderAggregates(supabaseUserId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: messages, error } = await supabase
    .from("messages")
    .select(
      "sender_id, importance_score, clutter_score, risk_score, is_read, has_unsubscribe_header"
    )
    .eq("user_id", supabaseUserId)
    .not("sender_id", "is", null);

  if (error) {
    console.error("[aggregates] failed to fetch messages:", error);
    return;
  }
  if (!messages?.length) return;

  // ── Aggregate by sender_id ──────────────────────────────────────────────

  type SenderAgg = {
    count:           number;
    importanceSum:   number;
    clutterSum:      number;
    riskSum:         number;
    readCount:       number;
    hasUnsub:        boolean;
  };

  const agg = new Map<string, SenderAgg>();

  for (const msg of messages) {
    const key = msg.sender_id as string;
    const e   = agg.get(key) ?? {
      count: 0, importanceSum: 0, clutterSum: 0, riskSum: 0,
      readCount: 0, hasUnsub: false,
    };
    e.count++;
    e.importanceSum += msg.importance_score ?? 0;
    e.clutterSum    += msg.clutter_score    ?? 0;
    e.riskSum       += msg.risk_score       ?? 0;
    if (msg.is_read)                e.readCount++;
    if (msg.has_unsubscribe_header) e.hasUnsub = true;
    agg.set(key, e);
  }

  // ── Update each sender (they already exist from the scan) ───────────────

  const entries = [...agg.entries()];

  for (const [senderId, a] of entries) {
    const { error: updateErr } = await supabase
      .from("senders")
      .update({
        message_count:    a.count,
        importance_score: parseFloat((a.importanceSum / a.count).toFixed(2)),
        clutter_score:    parseFloat((a.clutterSum    / a.count).toFixed(2)),
        trust_score:      parseFloat((a.importanceSum / a.count).toFixed(2)),
        open_count:       a.readCount,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", senderId)
      .eq("user_id", supabaseUserId);

    if (updateErr) {
      console.error(`[aggregates] sender update failed for ${senderId}:`, updateErr);
    }
  }
}
