import { createAdminClient } from "@/lib/supabase/admin";
import { computeSenderJunkScore } from "@/lib/scoring/junk-score";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CleanupRecommendation {
  senderId:       string;
  senderEmail:    string;
  senderName:     string | null;
  senderDomain:   string;
  messageCount:   number;
  recentCount:    number;  // last 30 days
  openRate:       number;  // 0-100 percent
  suggestedAction: "archive" | "unsubscribe_and_archive";
  confidence:     "High" | "Medium" | "Low";
  reason:         string;
  sampleSubjects: string[];
}

export interface ProtectedSenderSummary {
  id:               string;
  senderEmail:      string;
  senderName:       string | null;
  protectionReason: string;
  reasonIcon:       string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceLabel(clutterScore: number): "High" | "Medium" | "Low" {
  if (clutterScore >= 82) return "High";
  if (clutterScore >= 68) return "Medium";
  return "Low";
}

function buildReason(
  messageCount: number,
  recentCount:  number,
  openCount:    number,
  hasUnsub:     boolean
): string {
  const displayCount = recentCount > 0 ? recentCount : messageCount;
  const timeframe    = recentCount > 0 ? "in the last 30 days" : "in your inbox";
  const opened       = messageCount > 0 ? Math.round((openCount / messageCount) * 100) : 0;
  const openedPhrase = opened === 0 ? "opened none" : `opened ${opened}%`;
  const unsubPhrase  = hasUnsub ? ", and this sender includes an unsubscribe link" : "";
  return `You received ${displayCount} email${displayCount !== 1 ? "s" : ""} ${timeframe}, ${openedPhrase}${unsubPhrase}.`;
}

function protectionReason(
  domain: string,
  importanceScore: number
): { reason: string; icon: string } {
  const d = domain.toLowerCase();
  if (d.endsWith(".gov") || d.endsWith(".mil"))
    return { reason: "Government", icon: "🏛️" };
  if (d.endsWith(".edu") || /\.ac\.[a-z]{2}$/.test(d) || d.includes(".k12."))
    return { reason: "Academic institution", icon: "🎓" };
  if (/bank|chase|fidelity|schwab|paypal|stripe|venmo|insurance|cigna|aetna/i.test(d))
    return { reason: "Financial & security", icon: "🔒" };
  if (/hospital|health|medical|clinic|mychart/i.test(d))
    return { reason: "Healthcare", icon: "🏥" };
  if (importanceScore >= 85)
    return { reason: "Frequently opened", icon: "⭐" };
  return { reason: "High engagement", icon: "📌" };
}

// ---------------------------------------------------------------------------
// buildCleanupRecommendations
// ---------------------------------------------------------------------------

/**
 * Queries senders meeting the cleanup threshold (§3.10) and enriches them
 * with recent counts, unsubscribe presence, and sample subjects.
 */
export async function buildCleanupRecommendations(
  supabaseUserId: string
): Promise<{
  recommendations: CleanupRecommendation[];
  protected: ProtectedSenderSummary[];
}> {
  const supabase = createAdminClient();

  const [clutterResult, protectedResult] = await Promise.all([
    // Fetch all senders with enough messages for scoring — the weighted junk
    // score replaces the old static clutter_score/importance_score filters
    supabase
      .from("senders")
      .select(
        "id, sender_email, sender_name, sender_domain, message_count, open_count, " +
        "reply_count, archive_count, restore_count, ignore_count, clutter_score, " +
        "importance_score, learned_state, sender_category, last_engaged_at"
      )
      .eq("user_id", supabaseUserId)
      .gte("message_count", 3)
      .neq("learned_state", "always_archive")
      .neq("learned_state", "always_keep")
      .order("message_count", { ascending: false })
      .limit(100) as unknown as {
        data: Array<{
          id: string; sender_email: string; sender_name: string | null;
          sender_domain: string; message_count: number; open_count: number;
          reply_count: number; archive_count: number; restore_count: number;
          ignore_count: number; clutter_score: number; importance_score: number;
          learned_state: string; sender_category: string | null;
          last_engaged_at: string | null;
        }> | null;
      },

    supabase
      .from("senders")
      .select("id, sender_email, sender_name, sender_domain, importance_score")
      .eq("user_id", supabaseUserId)
      .gte("importance_score", 65)
      .order("importance_score", { ascending: false })
      .limit(12),
  ]);

  const clutter   = clutterResult.data ?? [];
  const rawProtected = protectedResult.data ?? [];

  // Build protected summary
  const protectedSenders: ProtectedSenderSummary[] = rawProtected.map(s => {
    const { reason, icon } = protectionReason(s.sender_domain ?? "", s.importance_score);
    return {
      id:               s.id,
      senderEmail:      s.sender_email,
      senderName:       s.sender_name ?? null,
      protectionReason: reason,
      reasonIcon:       icon,
    };
  });

  if (clutter.length === 0) {
    return { recommendations: [], protected: protectedSenders };
  }

  const senderIds = clutter.map(s => s.id);

  // Check which senders still have unarchived messages
  const { data: unarchivedCounts } = await supabase
    .from("messages")
    .select("sender_id")
    .eq("user_id", supabaseUserId)
    .in("sender_id", senderIds)
    .eq("action_status", "none");

  const sendersWithUnarchived = new Set(
    (unarchivedCounts ?? []).map(m => m.sender_id)
  );

  // Check which senders have unsubscribe headers
  const { data: unsubRows } = await supabase
    .from("messages")
    .select("sender_id")
    .eq("user_id", supabaseUserId)
    .in("sender_id", senderIds)
    .eq("has_unsubscribe_header", true)
    .limit(1000);

  const hasUnsub = new Set((unsubRows ?? []).map(m => m.sender_id));

  // Score each sender and filter by junk score threshold (0.50 = show as recommendation)
  const scoredSenders = clutter
    .filter(s => sendersWithUnarchived.has(s.id))
    .map(s => {
      const junk = computeSenderJunkScore({
        message_count:     s.message_count,
        open_count:        s.open_count,
        reply_count:       s.reply_count ?? 0,
        archive_count:     s.archive_count ?? 0,
        restore_count:     s.restore_count,
        ignore_count:      s.ignore_count ?? 0,
        dominant_category: s.sender_category ?? null,
        has_unsubscribe:   hasUnsub.has(s.id),
        last_engaged_at:   s.last_engaged_at ?? null,
        learned_state:     s.learned_state ?? "unknown",
      });
      return { sender: s, junk };
    })
    .filter(({ junk }) => junk.score >= 0.50)
    .sort((a, b) => b.junk.score - a.junk.score)
    .slice(0, 25);

  const activeSenderIds = scoredSenders.map(({ sender }) => sender.id);

  if (activeSenderIds.length === 0) {
    return { recommendations: [], protected: protectedSenders };
  }

  // Enrichment queries
  const [recentResult, subjectsResult] = await Promise.all([
    supabase
      .from("messages")
      .select("sender_id")
      .eq("user_id", supabaseUserId)
      .in("sender_id", activeSenderIds)
      .eq("action_status", "none")
      .gte("internal_date", new Date(Date.now() - 30 * 86400_000).toISOString()),

    supabase
      .from("messages")
      .select("sender_id, subject")
      .eq("user_id", supabaseUserId)
      .in("sender_id", activeSenderIds)
      .eq("action_status", "none")
      .not("subject", "is", null)
      .order("internal_date", { ascending: false })
      .limit(200),
  ]);

  const recentCounts = new Map<string, number>();
  for (const m of recentResult.data ?? []) {
    recentCounts.set(m.sender_id, (recentCounts.get(m.sender_id) ?? 0) + 1);
  }

  const subjectsMap = new Map<string, string[]>();
  for (const m of subjectsResult.data ?? []) {
    const existing = subjectsMap.get(m.sender_id) ?? [];
    if (existing.length < 3 && m.subject) {
      existing.push(m.subject as string);
      subjectsMap.set(m.sender_id, existing);
    }
  }

  const recommendations: CleanupRecommendation[] = scoredSenders
    .map(({ sender: s, junk }) => {
      const recentCount = recentCounts.get(s.id) ?? 0;
      const hasSub      = hasUnsub.has(s.id);
      const openRate    = s.message_count > 0
        ? Math.round((s.open_count / s.message_count) * 100)
        : 0;

      // Confidence based on junk score, not just clutter_score
      const confidence: "High" | "Medium" | "Low" =
        junk.score >= 0.85 ? "High" : junk.score >= 0.65 ? "Medium" : "Low";

      return {
        senderId:        s.id,
        senderEmail:     s.sender_email,
        senderName:      s.sender_name ?? null,
        senderDomain:    s.sender_domain,
        messageCount:    s.message_count,
        recentCount,
        openRate,
        suggestedAction: hasSub ? "unsubscribe_and_archive" : "archive",
        confidence,
        reason:          buildReason(s.message_count, recentCount, s.open_count, hasSub),
        sampleSubjects:  subjectsMap.get(s.id) ?? [],
      };
    });

  return { recommendations, protected: protectedSenders };
}
