import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewFilter =
  | "all"
  | "new_senders"
  | "borderline_promo"
  | "possible_important"
  | "expiring_soon";

export interface FullReviewItem {
  queueId:             string;
  messageId:           string;
  senderId:            string | null;
  senderName:          string | null;
  senderEmail:         string | null;
  senderDomain:        string | null;
  senderMessageCount:  number;
  senderOpenCount:     number;
  senderArchiveCount:  number;
  senderRestoreCount:  number;
  subject:             string | null;
  snippet:             string | null;
  finalCategory:       string | null;
  confidenceScore:     number | null;
  queueReason:         string;
  actionReason:        string | null;
  receivedAt:          string | null;
  hasUnsubscribeHeader: boolean;
  expiresAt:           string | null;
  similarCount:        number;
}

// ---------------------------------------------------------------------------
// Filter predicates (applied in-memory after fetch)
// ---------------------------------------------------------------------------

const PROMO_CATEGORIES  = new Set(["promotion", "newsletter", "spam_like", "uncertain"]);
const IMPORT_CATEGORIES = new Set([
  "critical_transactional", "personal_human", "work_school", "recurring_useful",
]);

function applyFilter(items: FullReviewItem[], filter: ReviewFilter): FullReviewItem[] {
  if (filter === "all") return items;

  const now = Date.now();

  return items.filter(item => {
    switch (filter) {
      case "new_senders":
        return item.senderMessageCount < 5;

      case "borderline_promo":
        return PROMO_CATEGORIES.has(item.finalCategory ?? "");

      case "possible_important":
        return IMPORT_CATEGORIES.has(item.finalCategory ?? "");

      case "expiring_soon":
        if (!item.expiresAt) return false;
        return new Date(item.expiresAt).getTime() - now < 48 * 3_600_000;

      default:
        return true;
    }
  });
}

// ---------------------------------------------------------------------------
// fetchReviewItems
// ---------------------------------------------------------------------------

export async function fetchReviewItems(
  supabaseUserId: string,
  filter: ReviewFilter = "all",
  limit  = 50
): Promise<FullReviewItem[]> {
  const supabase = createAdminClient();

  // 1. Get unresolved queue items
  const { data: queueRows } = await supabase
    .from("review_queue")
    .select("id, queue_reason, message_id, expires_at")
    .eq("user_id", supabaseUserId)
    .eq("resolved", false)
    .order("priority", { ascending: true })
    .order("created_at",  { ascending: false })
    .limit(limit);

  if (!queueRows?.length) return [];

  const messageIds = queueRows.map(q => q.message_id).filter(Boolean) as string[];

  // 2. Fetch messages
  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, subject, snippet, final_category, confidence_score, action_reason, internal_date, has_unsubscribe_header, sender_id"
    )
    .in("id", messageIds);

  if (!messages?.length) return [];

  const msgMap = new Map(messages.map(m => [m.id, m]));

  // 3. Fetch senders
  const senderIds = [
    ...new Set(messages.map(m => m.sender_id).filter(Boolean)),
  ] as string[];

  const { data: senders } = senderIds.length
    ? await supabase
        .from("senders")
        .select(
          "id, sender_name, sender_email, sender_domain, message_count, open_count, archive_count, restore_count"
        )
        .in("id", senderIds)
    : { data: [] };

  const senderMap = new Map((senders ?? []).map(s => [s.id, s]));

  // 4. Merge
  const items: FullReviewItem[] = queueRows
    .map(q => {
      const msg    = msgMap.get(q.message_id);
      if (!msg) return null;
      const sender = msg.sender_id ? senderMap.get(msg.sender_id) : null;

      return {
        queueId:             q.id,
        messageId:           q.message_id,
        senderId:            msg.sender_id ?? null,
        senderName:          sender?.sender_name ?? null,
        senderEmail:         sender?.sender_email ?? null,
        senderDomain:        sender?.sender_domain ?? null,
        senderMessageCount:  sender?.message_count ?? 0,
        senderOpenCount:     sender?.open_count    ?? 0,
        senderArchiveCount:  sender?.archive_count ?? 0,
        senderRestoreCount:  sender?.restore_count ?? 0,
        subject:             msg.subject     ?? null,
        snippet:             msg.snippet     ?? null,
        finalCategory:       msg.final_category   ?? null,
        confidenceScore:     msg.confidence_score !== null ? Number(msg.confidence_score) : null,
        queueReason:         q.queue_reason,
        actionReason:        msg.action_reason ?? null,
        receivedAt:          msg.internal_date ?? null,
        hasUnsubscribeHeader: msg.has_unsubscribe_header ?? false,
        expiresAt:           q.expires_at ?? null,
        similarCount:        sender?.message_count ?? 0,
      } satisfies FullReviewItem;
    })
    .filter((item): item is FullReviewItem => item !== null);

  return applyFilter(items, filter);
}
