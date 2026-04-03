import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryBreakdownItem {
  category:    string;
  label:       string;
  count:       number;
  pct:         number;
  color:       string; // Tailwind bg class
  description: string;
}

export interface ClutterSender {
  id:               string;
  sender_email:     string;
  sender_name:      string | null;
  sender_domain:    string;
  message_count:    number;
  recent_count:     number;  // last 30 days
  open_count:       number;
  clutter_score:    number;
  importance_score: number;
  has_unsubscribe:  boolean;
  badge:            string;
  badge_color:      string; // Tailwind classes
  suggested_action: string;
  confidence_label: "High" | "Medium" | "Low";
}

export interface ProtectedSender {
  id:               string;
  sender_email:     string;
  sender_name:      string | null;
  sender_domain:    string;
  importance_score: number;
  protection_reason: string;
  reason_icon:      string; // emoji — exception to the no-emoji rule since it's UI data, not text
}

export interface InboxDiagnosis {
  summary: {
    total_messages:          number;
    archive_candidates:      number;
    suggested_unsubscribes:  number;
    important_protected:     number;
    estimated_reduction_pct: number;
  };
  category_breakdown: CategoryBreakdownItem[];
  top_clutter_senders: ClutterSender[];
  protected_senders:  ProtectedSender[];
}

// ---------------------------------------------------------------------------
// Static maps
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { label: string; color: string; description: string }> = {
  promotion:           { label: "Promotions",        color: "bg-amber-400",  description: "Marketing emails and sales campaigns"       },
  newsletter:          { label: "Newsletters",        color: "bg-orange-400", description: "Curated content digests and roundups"        },
  recurring_low_value: { label: "Low-value recurring",color: "bg-red-400",    description: "Emails you consistently ignore"              },
  spam_like:           { label: "Spam-like",          color: "bg-red-600",    description: "Unsolicited or low-quality bulk mail"        },
  uncertain:           { label: "Uncategorized",      color: "bg-gray-300",   description: "Emails that need a closer look"              },
  critical_transactional: { label: "Transactional",  color: "bg-green-400",  description: "Receipts, alerts, and account notices"       },
  work_school:         { label: "Work & School",      color: "bg-blue-400",   description: "Messages from your job or institution"       },
  personal_human:      { label: "Personal",           color: "bg-purple-400", description: "Genuine person-to-person emails"             },
  recurring_useful:    { label: "Useful recurring",   color: "bg-teal-400",   description: "Regular emails you actually open"            },
};

// Display order for the breakdown section (clutter first, then important)
const CATEGORY_ORDER = [
  "promotion", "newsletter", "recurring_low_value", "spam_like",
  "work_school", "critical_transactional", "personal_human",
  "recurring_useful", "uncertain",
];

const BADGE_META: Record<string, { label: string; color: string }> = {
  promotion:           { label: "Promo",      color: "bg-amber-100 text-amber-800"  },
  newsletter:          { label: "Newsletter", color: "bg-orange-100 text-orange-800"},
  recurring_low_value: { label: "Low-value",  color: "bg-red-100 text-red-800"      },
  spam_like:           { label: "Spam",       color: "bg-red-200 text-red-900"      },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceLabel(clutterScore: number): "High" | "Medium" | "Low" {
  if (clutterScore >= 82) return "High";
  if (clutterScore >= 68) return "Medium";
  return "Low";
}

function protectionReason(domain: string, importanceScore: number): { reason: string; icon: string } {
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
// computeInboxDiagnosis (§3.9)
// ---------------------------------------------------------------------------

export async function computeInboxDiagnosis(
  supabaseUserId: string
): Promise<InboxDiagnosis> {
  const supabase = createAdminClient();

  // ── Parallel fetches ──────────────────────────────────────────────────────

  const [msgResult, clutterResult, protectedResult] = await Promise.all([
    // All message categories + recommended actions for summary + breakdown
    supabase
      .from("messages")
      .select("final_category, recommended_action")
      .eq("user_id", supabaseUserId),

    // Clutter sender candidates (§3.10: count ≥ 3, clutter ≥ 70, importance ≤ 35, restore = 0)
    supabase
      .from("senders")
      .select("id, sender_email, sender_name, sender_domain, message_count, open_count, clutter_score, importance_score, restore_count")
      .eq("user_id", supabaseUserId)
      .gte("clutter_score", 60)
      .lte("importance_score", 40)
      .gte("message_count", 3)
      .eq("restore_count", 0)
      .order("message_count", { ascending: false })
      .limit(20),

    // Protected senders
    supabase
      .from("senders")
      .select("id, sender_email, sender_name, sender_domain, importance_score")
      .eq("user_id", supabaseUserId)
      .gte("importance_score", 65)
      .order("importance_score", { ascending: false })
      .limit(12),
  ]);

  const messages       = msgResult.data       ?? [];
  const clutterSenders = clutterResult.data   ?? [];
  const rawProtected   = protectedResult.data ?? [];

  // ── Summary stats ─────────────────────────────────────────────────────────

  const total             = messages.length;
  const archiveCandidates = messages.filter(m => m.recommended_action === "archive").length;
  const estimatedPct      = total > 0 ? Math.round((archiveCandidates / total) * 100) : 0;

  // ── Category breakdown ───────────────────────────────────────────────────

  const catMap = new Map<string, number>();
  for (const m of messages) {
    if (m.final_category) {
      catMap.set(m.final_category, (catMap.get(m.final_category) ?? 0) + 1);
    }
  }

  const category_breakdown: CategoryBreakdownItem[] = CATEGORY_ORDER
    .filter(cat => (catMap.get(cat) ?? 0) > 0)
    .map(cat => {
      const count = catMap.get(cat) ?? 0;
      const meta  = CATEGORY_META[cat] ?? { label: cat, color: "bg-gray-300", description: "" };
      return {
        category:    cat,
        label:       meta.label,
        count,
        pct:         total > 0 ? Math.round((count / total) * 100) : 0,
        color:       meta.color,
        description: meta.description,
      };
    });

  // ── Enrich clutter senders ───────────────────────────────────────────────

  const clutterIds = clutterSenders.map(s => s.id);

  // Recent message counts (last 30 days) and unsubscribe presence
  const [recentResult, unsubResult] = await Promise.all([
    clutterIds.length > 0
      ? supabase
          .from("messages")
          .select("sender_id")
          .eq("user_id", supabaseUserId)
          .in("sender_id", clutterIds)
          .gte("internal_date", new Date(Date.now() - 30 * 86400_000).toISOString())
      : Promise.resolve({ data: [] }),

    clutterIds.length > 0
      ? supabase
          .from("messages")
          .select("sender_id")
          .eq("user_id", supabaseUserId)
          .in("sender_id", clutterIds)
          .eq("has_unsubscribe_header", true)
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);

  const recentCounts    = new Map<string, number>();
  for (const m of recentResult.data ?? []) {
    recentCounts.set(m.sender_id, (recentCounts.get(m.sender_id) ?? 0) + 1);
  }

  const sendersWithUnsub = new Set((unsubResult.data ?? []).map(m => m.sender_id));

  // Determine dominant final_category per clutter sender for the badge
  const catPerSender = new Map<string, Map<string, number>>();
  if (clutterIds.length > 0) {
    const { data: catMsgs } = await supabase
      .from("messages")
      .select("sender_id, final_category")
      .eq("user_id", supabaseUserId)
      .in("sender_id", clutterIds)
      .not("final_category", "is", null);

    for (const m of catMsgs ?? []) {
      if (!catPerSender.has(m.sender_id)) catPerSender.set(m.sender_id, new Map());
      const inner = catPerSender.get(m.sender_id)!;
      inner.set(m.final_category, (inner.get(m.final_category) ?? 0) + 1);
    }
  }

  function dominantCategory(senderId: string): string {
    const inner = catPerSender.get(senderId);
    if (!inner) return "promotion";
    return [...inner.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "promotion";
  }

  const top_clutter_senders: ClutterSender[] = clutterSenders.map(s => {
    const cat        = dominantCategory(s.id);
    const badgeMeta  = BADGE_META[cat] ?? { label: "Clutter", color: "bg-gray-100 text-gray-700" };
    const hasUnsub   = sendersWithUnsub.has(s.id);
    const recentCnt  = recentCounts.get(s.id) ?? 0;

    return {
      id:               s.id,
      sender_email:     s.sender_email,
      sender_name:      s.sender_name ?? null,
      sender_domain:    s.sender_domain,
      message_count:    s.message_count,
      recent_count:     recentCnt,
      open_count:       s.open_count,
      clutter_score:    s.clutter_score,
      importance_score: s.importance_score,
      has_unsubscribe:  hasUnsub,
      badge:            badgeMeta.label,
      badge_color:      badgeMeta.color,
      suggested_action: hasUnsub ? "Unsubscribe & archive" : "Archive all",
      confidence_label: confidenceLabel(s.clutter_score),
    };
  });

  // ── Protected senders ─────────────────────────────────────────────────────

  const protected_senders: ProtectedSender[] = rawProtected.map(s => {
    const { reason, icon } = protectionReason(s.sender_domain ?? "", s.importance_score);
    return {
      id:                s.id,
      sender_email:      s.sender_email,
      sender_name:       s.sender_name ?? null,
      sender_domain:     s.sender_domain,
      importance_score:  s.importance_score,
      protection_reason: reason,
      reason_icon:       icon,
    };
  });

  const suggestedUnsubscribes = top_clutter_senders.filter(s => s.has_unsubscribe).length;

  return {
    summary: {
      total_messages:          total,
      archive_candidates:      archiveCandidates,
      suggested_unsubscribes:  suggestedUnsubscribes,
      important_protected:     rawProtected.length,
      estimated_reduction_pct: estimatedPct,
    },
    category_breakdown,
    top_clutter_senders,
    protected_senders,
  };
}
