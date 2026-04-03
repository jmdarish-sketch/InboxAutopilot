import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardStats {
  handledToday:     number;
  handledDelta:     number; // vs yesterday (positive = more than yesterday)
  archivedToday:    number;
  archivedDelta:    number;
  needsReview:      number;
  importantSurfaced: number;
}

export interface ReviewQueueItem {
  queueId:       string;
  messageId:     string;
  senderId:      string | null;
  senderName:    string | null;
  senderEmail:   string | null;
  subject:       string | null;
  snippet:       string | null;
  queueReason:   string;
  finalCategory: string | null;
  receivedAt:    string | null;
}

export interface ImportantInboxItem {
  messageId:      string;
  gmailThreadId:  string | null;
  senderName:     string | null;
  senderEmail:    string | null;
  subject:        string | null;
  snippet:        string | null;
  actionReason:   string | null;
  finalCategory:  string | null;
  receivedAt:     string | null;
}

export interface RecentActionItem {
  actionId:      string;
  senderId:      string | null;
  senderName:    string | null;
  senderEmail:   string | null;
  actionType:    string;
  actionSource:  string;
  archivedCount: number;
  reason:        string | null;
  createdAt:     string;
  reversible:    boolean;
  undone:        boolean;
}

export interface DashboardSummary {
  stats:          DashboardStats;
  reviewPreview:  ReviewQueueItem[];
  importantInbox: ImportantInboxItem[];
  recentActions:  RecentActionItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfDayUtc(daysAgo = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

const IMPORTANT_CATEGORIES = [
  "critical_transactional",
  "personal_human",
  "work_school",
  "recurring_useful",
];

// ---------------------------------------------------------------------------
// fetchDashboardSummary
// ---------------------------------------------------------------------------

export async function fetchDashboardSummary(
  supabaseUserId: string
): Promise<DashboardSummary> {
  const supabase = createAdminClient();
  const todayStart     = startOfDayUtc(0);
  const yesterdayStart = startOfDayUtc(1);

  // ── Parallel top-level fetches ──────────────────────────────────────────

  const [
    handledTodayRes,
    handledYestRes,
    archivedTodayRes,
    archivedYestRes,
    reviewCountRes,
    importantRes,
    queueRes,
    actionsRes,
  ] = await Promise.all([
    // Handled today
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("status", "succeeded")
      .gte("created_at", todayStart),

    // Handled yesterday
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("status", "succeeded")
      .gte("created_at", yesterdayStart)
      .lt("created_at", todayStart),

    // Archived today
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("action_type", "archive")
      .eq("status", "succeeded")
      .gte("created_at", todayStart),

    // Archived yesterday
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("action_type", "archive")
      .eq("status", "succeeded")
      .gte("created_at", yesterdayStart)
      .lt("created_at", todayStart),

    // Needs review
    supabase
      .from("review_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("resolved", false),

    // Important surfaced (total in system, not just today)
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("recommended_action", "keep_inbox")
      .in("final_category", IMPORTANT_CATEGORIES),

    // Review queue preview (top 5)
    supabase
      .from("review_queue")
      .select("id, queue_reason, message_id")
      .eq("user_id", supabaseUserId)
      .eq("resolved", false)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(5),

    // Recent actions feed (last 10)
    supabase
      .from("actions_log")
      .select("id, sender_id, action_type, action_source, reason, reversible, undone, metadata, created_at")
      .eq("user_id", supabaseUserId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const handledToday = handledTodayRes.count ?? 0;
  const handledYest  = handledYestRes.count  ?? 0;
  const archivedToday = archivedTodayRes.count ?? 0;
  const archivedYest  = archivedYestRes.count  ?? 0;

  // ── Enrich review queue preview ─────────────────────────────────────────

  const queueItems    = queueRes.data ?? [];
  const queueMsgIds   = queueItems.map(q => q.message_id).filter(Boolean) as string[];

  let reviewPreview: ReviewQueueItem[] = [];

  if (queueMsgIds.length > 0) {
    const [msgsRes, sendersFromMsgs] = await Promise.all([
      supabase
        .from("messages")
        .select("id, subject, snippet, final_category, internal_date, sender_id")
        .in("id", queueMsgIds),
      Promise.resolve(null), // placeholder — resolved below
    ]);
    void sendersFromMsgs;

    const msgs       = msgsRes.data ?? [];
    const senderIds  = [...new Set(msgs.map(m => m.sender_id).filter(Boolean))] as string[];

    const sendersRes = senderIds.length > 0
      ? await supabase
          .from("senders")
          .select("id, sender_name, sender_email")
          .in("id", senderIds)
      : { data: [] };

    const msgMap    = new Map(msgs.map(m => [m.id, m]));
    const senderMap = new Map((sendersRes.data ?? []).map(s => [s.id, s]));

    reviewPreview = queueItems.map(q => {
      const msg    = msgMap.get(q.message_id);
      const sender = msg?.sender_id ? senderMap.get(msg.sender_id) : null;
      return {
        queueId:       q.id,
        messageId:     q.message_id,
        senderId:      msg?.sender_id ?? null,
        senderName:    sender?.sender_name ?? null,
        senderEmail:   sender?.sender_email ?? null,
        subject:       msg?.subject ?? null,
        snippet:       msg?.snippet ?? null,
        queueReason:   q.queue_reason,
        finalCategory: msg?.final_category ?? null,
        receivedAt:    msg?.internal_date ?? null,
      };
    });
  }

  // ── Enrich important inbox ───────────────────────────────────────────────

  const importantMsgsRes = await supabase
    .from("messages")
    .select("id, gmail_thread_id, subject, snippet, final_category, action_reason, internal_date, sender_id")
    .eq("user_id", supabaseUserId)
    .eq("recommended_action", "keep_inbox")
    .in("final_category", IMPORTANT_CATEGORIES)
    .order("internal_date", { ascending: false })
    .limit(5);

  const importantMsgs = importantMsgsRes.data ?? [];
  const importantSenderIds = [...new Set(
    importantMsgs.map(m => m.sender_id).filter(Boolean)
  )] as string[];

  const importantSendersRes = importantSenderIds.length > 0
    ? await supabase
        .from("senders")
        .select("id, sender_name, sender_email")
        .in("id", importantSenderIds)
    : { data: [] };

  const importantSenderMap = new Map(
    (importantSendersRes.data ?? []).map(s => [s.id, s])
  );

  const importantInbox: ImportantInboxItem[] = importantMsgs.map(m => {
    const sender = m.sender_id ? importantSenderMap.get(m.sender_id) : null;
    return {
      messageId:     m.id,
      gmailThreadId: m.gmail_thread_id ?? null,
      senderName:    sender?.sender_name ?? null,
      senderEmail:   sender?.sender_email ?? null,
      subject:       m.subject ?? null,
      snippet:       m.snippet ?? null,
      actionReason:  m.action_reason ?? null,
      finalCategory: m.final_category ?? null,
      receivedAt:    m.internal_date ?? null,
    };
  });

  // ── Enrich recent actions feed ───────────────────────────────────────────

  const actionRows = actionsRes.data ?? [];
  const actionSenderIds = [...new Set(
    actionRows.map(a => a.sender_id).filter(Boolean)
  )] as string[];

  const actionSendersRes = actionSenderIds.length > 0
    ? await supabase
        .from("senders")
        .select("id, sender_name, sender_email")
        .in("id", actionSenderIds)
    : { data: [] };

  const actionSenderMap = new Map(
    (actionSendersRes.data ?? []).map(s => [s.id, s])
  );

  const recentActions: RecentActionItem[] = actionRows.map(a => {
    const sender       = a.sender_id ? actionSenderMap.get(a.sender_id) : null;
    const meta         = (a.metadata ?? {}) as Record<string, unknown>;
    const archivedCount = typeof meta.archived_count === "number" ? meta.archived_count : 1;
    return {
      actionId:      a.id,
      senderId:      a.sender_id ?? null,
      senderName:    sender?.sender_name ?? null,
      senderEmail:   sender?.sender_email ?? null,
      actionType:    a.action_type,
      actionSource:  a.action_source,
      archivedCount,
      reason:        a.reason ?? null,
      createdAt:     a.created_at,
      reversible:    a.reversible,
      undone:        a.undone,
    };
  });

  return {
    stats: {
      handledToday,
      handledDelta:    handledToday - handledYest,
      archivedToday,
      archivedDelta:   archivedToday - archivedYest,
      needsReview:     reviewCountRes.count ?? 0,
      importantSurfaced: importantRes.count ?? 0,
    },
    reviewPreview,
    importantInbox,
    recentActions,
  };
}
