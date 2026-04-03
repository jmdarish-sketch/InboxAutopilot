import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestUnsubscribeCandidate {
  senderEmail: string;
  senderName:  string | null;
  emailsPerMonth: number;
  archiveRate: number; // 0–1
}

export interface DigestNewPattern {
  senderEmail: string;
  senderName:  string | null;
  detectedAs:  string; // human-readable category label
}

export interface DigestImportantItem {
  senderName:  string | null;
  senderEmail: string | null;
  subject:     string | null;
  snippet:     string | null;
  reason:      string | null;
}

export interface DigestSummary {
  periodStart:           string;
  periodEnd:             string;
  handledCount:          number;
  archivedCount:         number;
  unsubscribedCount:     number;
  reviewNeededCount:     number;
  newPatternsDetected:   DigestNewPattern[];
  unsubscribeCandidates: DigestUnsubscribeCandidate[];
  importantSurfaced:     DigestImportantItem[];
}

// ---------------------------------------------------------------------------
// generateDigest
// ---------------------------------------------------------------------------

const IMPORTANT_CATEGORIES = [
  "critical_transactional",
  "personal_human",
  "work_school",
  "recurring_useful",
];

export async function generateDigest(
  supabaseUserId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<DigestSummary> {
  const supabase = createAdminClient();
  const start    = periodStart.toISOString();
  const end      = periodEnd.toISOString();

  // ── Parallel queries ──────────────────────────────────────────────────────

  const [
    handledRes,
    archivedRes,
    unsubRes,
    reviewRes,
    newSendersRes,
    importantRes,
  ] = await Promise.all([
    // Total handled actions in period
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("status", "succeeded")
      .gte("created_at", start)
      .lte("created_at", end),

    // Archive actions in period
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("action_type", "archive")
      .eq("status", "succeeded")
      .gte("created_at", start)
      .lte("created_at", end),

    // Unsubscribe actions in period
    supabase
      .from("actions_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("action_type", "unsubscribe")
      .eq("status", "succeeded")
      .gte("created_at", start)
      .lte("created_at", end),

    // Open review queue items
    supabase
      .from("review_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", supabaseUserId)
      .eq("resolved", false),

    // Senders first seen in this period (new patterns)
    supabase
      .from("senders")
      .select("sender_email, sender_name, sender_category")
      .eq("user_id", supabaseUserId)
      .gte("first_seen_at", start)
      .lte("first_seen_at", end)
      .limit(10) as unknown as Promise<{
        data: Array<{
          sender_email: string;
          sender_name:  string | null;
          sender_category: string | null;
        }> | null;
      }>,

    // Important messages in period
    supabase
      .from("messages")
      .select("subject, snippet, action_reason, sender_id")
      .eq("user_id", supabaseUserId)
      .eq("recommended_action", "keep_inbox")
      .in("final_category", IMPORTANT_CATEGORIES)
      .gte("internal_date", start)
      .lte("internal_date", end)
      .order("internal_date", { ascending: false })
      .limit(5) as unknown as Promise<{
        data: Array<{
          subject:       string | null;
          snippet:       string | null;
          action_reason: string | null;
          sender_id:     string | null;
        }> | null;
      }>,
  ]);

  // ── Unsubscribe candidates: senders with high archive rate, has_unsubscribe ──

  const unsubCandidatesRes = await supabase
    .from("senders")
    .select("sender_email, sender_name, message_count, archive_count")
    .eq("user_id", supabaseUserId)
    .gt("message_count", 3)
    .gt("clutter_score", 70)
    .neq("learned_state", "always_archive") // not already handled
    .order("archive_count", { ascending: false })
    .limit(5) as unknown as {
      data: Array<{
        sender_email:  string;
        sender_name:   string | null;
        message_count: number;
        archive_count: number;
      }> | null;
    };

  // ── Enrich important messages with sender info ────────────────────────────

  const importantMsgs = importantRes.data ?? [];
  const senderIds = [...new Set(
    importantMsgs.map(m => m.sender_id).filter((id): id is string => !!id)
  )];

  const sendersRes = senderIds.length > 0
    ? await supabase
        .from("senders")
        .select("id, sender_name, sender_email")
        .in("id", senderIds) as unknown as Promise<{
          data: Array<{ id: string; sender_name: string | null; sender_email: string }> | null;
        }>
    : Promise.resolve({ data: [] as Array<{ id: string; sender_name: string | null; sender_email: string }> });

  const senderMap = new Map(
    ((await sendersRes).data ?? []).map(s => [s.id, s])
  );

  // ── Assemble summary ─────────────────────────────────────────────────────

  const CATEGORY_LABELS: Record<string, string> = {
    critical_transactional: "transactional",
    personal_human:         "personal",
    work_school:            "work/school",
    recurring_useful:       "recurring useful",
    recurring_low_value:    "low-value recurring",
    promotion:              "promotion",
    newsletter:             "newsletter",
    spam_like:              "spam-like",
    uncertain:              "uncertain",
  };

  const newPatterns: DigestNewPattern[] = (newSendersRes.data ?? []).map(s => ({
    senderEmail: s.sender_email,
    senderName:  s.sender_name,
    detectedAs:  CATEGORY_LABELS[s.sender_category ?? ""] ?? "new sender",
  }));

  const unsubCandidates: DigestUnsubscribeCandidate[] = (
    unsubCandidatesRes.data ?? []
  ).map(s => ({
    senderEmail:    s.sender_email,
    senderName:     s.sender_name,
    emailsPerMonth: s.message_count,
    archiveRate:    s.message_count > 0
      ? Math.round((s.archive_count / s.message_count) * 100) / 100
      : 0,
  }));

  const importantSurfaced: DigestImportantItem[] = importantMsgs.map(m => {
    const sender = m.sender_id ? senderMap.get(m.sender_id) : null;
    return {
      senderName:  sender?.sender_name  ?? null,
      senderEmail: sender?.sender_email ?? null,
      subject:     m.subject,
      snippet:     m.snippet,
      reason:      m.action_reason,
    };
  });

  return {
    periodStart:           start,
    periodEnd:             end,
    handledCount:          handledRes.count    ?? 0,
    archivedCount:         archivedRes.count   ?? 0,
    unsubscribedCount:     unsubRes.count      ?? 0,
    reviewNeededCount:     reviewRes.count     ?? 0,
    newPatternsDetected:   newPatterns,
    unsubscribeCandidates: unsubCandidates,
    importantSurfaced,
  };
}
