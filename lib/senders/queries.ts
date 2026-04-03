import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types — list
// ---------------------------------------------------------------------------

export interface SenderListItem {
  id:               string;
  senderEmail:      string;
  senderName:       string | null;
  senderDomain:     string;
  senderCategory:   string | null;
  messageCount:     number;
  recentCount:      number;   // last 30 days
  openCount:        number;
  replyCount:       number;
  archiveCount:     number;
  restoreCount:     number;
  unsubscribeCount: number;
  importanceScore:  number;
  clutterScore:     number;
  learnedState:     string;
  reviewRequired:   boolean;
  lastSeenAt:       string | null;
  // Most recent active rule (null = none)
  activeRuleAction: string | null;
  activeRuleSource: string | null;
}

// ---------------------------------------------------------------------------
// Types — detail
// ---------------------------------------------------------------------------

export interface SenderRecentMessage {
  id:            string;
  subject:       string | null;
  snippet:       string | null;
  finalCategory: string | null;
  reviewStatus:  string;
  receivedAt:    string | null;
}

export interface SenderDetail extends SenderListItem {
  clickCount:   number;
  trustScore:   number;
  firstSeenAt:  string | null;
  // Computed rates (0–100)
  openRate:     number;
  archiveRate:  number;
  restoreRate:  number;
  // Active rule with full fields
  activeRuleId:        string | null;
  activeRuleCreatedAt: string | null;
  // Recent messages
  recentMessages: SenderRecentMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THIRTY_DAYS_AGO = () =>
  new Date(Date.now() - 30 * 86_400_000).toISOString();

function rate(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

// ---------------------------------------------------------------------------
// fetchSenderList
// ---------------------------------------------------------------------------

export async function fetchSenderList(
  supabaseUserId: string
): Promise<SenderListItem[]> {
  const supabase = createAdminClient();

  const { data: senders } = await supabase
    .from("senders")
    .select(
      "id, sender_email, sender_name, sender_domain, sender_category, " +
      "message_count, open_count, reply_count, archive_count, restore_count, " +
      "unsubscribe_count, importance_score, clutter_score, learned_state, " +
      "review_required, last_seen_at"
    )
    .eq("user_id", supabaseUserId)
    .order("message_count", { ascending: false })
    .limit(300) as unknown as { data: Array<{
      id: string; sender_email: string; sender_name: string | null;
      sender_domain: string; sender_category: string | null;
      message_count: number; open_count: number; reply_count: number;
      archive_count: number; restore_count: number; unsubscribe_count: number;
      importance_score: string | number; clutter_score: string | number;
      learned_state: string | null; review_required: boolean;
      last_seen_at: string | null;
    }> | null };

  if (!senders?.length) return [];

  const senderIds = senders.map(s => s.id);

  // Recent message counts + active rules in parallel
  const [recentRes, rulesRes] = await Promise.all([
    supabase
      .from("messages")
      .select("sender_id")
      .eq("user_id", supabaseUserId)
      .in("sender_id", senderIds)
      .gte("internal_date", THIRTY_DAYS_AGO()),

    supabase
      .from("sender_rules")
      .select("sender_id, rule_action, source")
      .eq("user_id", supabaseUserId)
      .in("sender_id", senderIds)
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const recentCounts = new Map<string, number>();
  for (const m of recentRes.data ?? []) {
    recentCounts.set(m.sender_id, (recentCounts.get(m.sender_id) ?? 0) + 1);
  }

  // First rule per sender (most recent due to ORDER BY)
  const ruleMap = new Map<string, { ruleAction: string; source: string }>();
  for (const r of rulesRes.data ?? []) {
    if (!ruleMap.has(r.sender_id)) {
      ruleMap.set(r.sender_id, { ruleAction: r.rule_action, source: r.source });
    }
  }

  return senders.map(s => {
    const rule = ruleMap.get(s.id);
    return {
      id:               s.id,
      senderEmail:      s.sender_email,
      senderName:       s.sender_name ?? null,
      senderDomain:     s.sender_domain,
      senderCategory:   s.sender_category ?? null,
      messageCount:     s.message_count,
      recentCount:      recentCounts.get(s.id) ?? 0,
      openCount:        s.open_count,
      replyCount:       s.reply_count,
      archiveCount:     s.archive_count,
      restoreCount:     s.restore_count,
      unsubscribeCount: s.unsubscribe_count,
      importanceScore:  Number(s.importance_score),
      clutterScore:     Number(s.clutter_score),
      learnedState:     s.learned_state ?? "unknown",
      reviewRequired:   s.review_required,
      lastSeenAt:       s.last_seen_at ?? null,
      activeRuleAction: rule?.ruleAction ?? null,
      activeRuleSource: rule?.source     ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// fetchSenderDetail
// ---------------------------------------------------------------------------

export async function fetchSenderDetail(
  supabaseUserId: string,
  senderId: string
): Promise<SenderDetail | null> {
  const supabase = createAdminClient();

  type SenderRow = {
    id: string; sender_email: string; sender_name: string | null;
    sender_domain: string; sender_category: string | null;
    message_count: number; open_count: number; reply_count: number;
    archive_count: number; restore_count: number; unsubscribe_count: number;
    click_count: number; trust_score: string | number;
    importance_score: string | number; clutter_score: string | number;
    learned_state: string | null; review_required: boolean;
    first_seen_at: string | null; last_seen_at: string | null;
  };
  type RuleRow = { id: string; rule_action: string; source: string; created_at: string } | null;
  type MsgRow  = { id: string; subject: string | null; snippet: string | null; final_category: string | null; review_status: string; internal_date: string | null };

  const [senderRes, recentCountRes, activeRuleRes, recentMsgsRes] =
    await Promise.all([
      supabase
        .from("senders")
        .select(
          "id, sender_email, sender_name, sender_domain, sender_category, " +
          "message_count, open_count, reply_count, archive_count, restore_count, " +
          "unsubscribe_count, click_count, trust_score, importance_score, " +
          "clutter_score, learned_state, review_required, first_seen_at, last_seen_at"
        )
        .eq("id", senderId)
        .eq("user_id", supabaseUserId)
        .single() as unknown as Promise<{ data: SenderRow | null }>,

      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", supabaseUserId)
        .eq("sender_id", senderId)
        .gte("internal_date", THIRTY_DAYS_AGO()) as unknown as Promise<{ count: number | null }>,

      supabase
        .from("sender_rules")
        .select("id, rule_action, source, created_at")
        .eq("user_id", supabaseUserId)
        .eq("sender_id", senderId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as Promise<{ data: RuleRow }>,

      supabase
        .from("messages")
        .select("id, subject, snippet, final_category, review_status, internal_date")
        .eq("user_id", supabaseUserId)
        .eq("sender_id", senderId)
        .order("internal_date", { ascending: false })
        .limit(10) as unknown as Promise<{ data: MsgRow[] | null }>,
    ]);

  const s = senderRes.data;
  if (!s) return null;

  const mc    = s.message_count;
  const rule  = activeRuleRes.data;

  return {
    id:               s.id,
    senderEmail:      s.sender_email,
    senderName:       s.sender_name ?? null,
    senderDomain:     s.sender_domain,
    senderCategory:   s.sender_category ?? null,
    messageCount:     mc,
    recentCount:      recentCountRes.count ?? 0,
    openCount:        s.open_count,
    replyCount:       s.reply_count,
    archiveCount:     s.archive_count,
    restoreCount:     s.restore_count,
    unsubscribeCount: s.unsubscribe_count,
    clickCount:       s.click_count,
    trustScore:       Number(s.trust_score),
    importanceScore:  Number(s.importance_score),
    clutterScore:     Number(s.clutter_score),
    learnedState:     s.learned_state ?? "unknown",
    reviewRequired:   s.review_required,
    firstSeenAt:      s.first_seen_at ?? null,
    lastSeenAt:       s.last_seen_at  ?? null,
    openRate:         rate(s.open_count,    mc),
    archiveRate:      rate(s.archive_count, mc),
    restoreRate:      rate(s.restore_count, mc),
    activeRuleAction: rule?.rule_action ?? null,
    activeRuleSource: rule?.source      ?? null,
    activeRuleId:     rule?.id          ?? null,
    activeRuleCreatedAt: rule?.created_at ?? null,
    recentMessages: (recentMsgsRes.data ?? []).map(m => ({
      id:            m.id,
      subject:       m.subject       ?? null,
      snippet:       m.snippet       ?? null,
      finalCategory: m.final_category ?? null,
      reviewStatus:  m.review_status,
      receivedAt:    m.internal_date  ?? null,
    })),
  };
}
