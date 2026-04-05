// ---------------------------------------------------------------------------
// computeSenderJunkScore
//
// Weighted scoring engine that replaces the all-conditions-must-be-true model.
// Used by auto-cleanup, autopilot execution, and cleanup recommendations.
//
// Score range: 0 (definitely not junk) to ~1.0 (definitely junk).
// Higher = more likely to be junk.
// ---------------------------------------------------------------------------

export interface SenderScoringInput {
  message_count:       number;
  open_count:          number;
  reply_count:         number;
  archive_count:       number;
  restore_count:       number;
  ignore_count:        number;
  // Most common final_category across this sender's messages
  dominant_category:   string | null;
  // Whether any message from this sender has an unsubscribe header
  has_unsubscribe:     boolean;
  // When the user last opened, replied, or starred an email from this sender
  last_engaged_at:     string | null;
  // The sender's current learned_state
  learned_state:       string;
}

export interface JunkScoreResult {
  score:               number;  // 0-1, higher = more junk
  ignore_rate:         number;  // 0-1
  reply_rate:          number;  // 0-1
  recency_protection:  number;  // 0-0.5 (subtracted from score)
  signals:             string[];
}

// ---------------------------------------------------------------------------
// Thresholds per autopilot mode
// ---------------------------------------------------------------------------

export interface ModeThresholds {
  archiveThreshold:       number;
  filterThreshold:        number;
  unsubscribeThreshold:   number | null; // null = never auto-unsubscribe
}

export const MODE_THRESHOLDS: Record<string, ModeThresholds> = {
  suggest_only: {
    archiveThreshold:     Infinity,  // never auto-archive
    filterThreshold:      Infinity,
    unsubscribeThreshold: null,
  },
  safe: {
    archiveThreshold:     0.80,
    filterThreshold:      0.92,
    unsubscribeThreshold: null,      // no auto-unsubscribe in safe mode
  },
  balanced: {
    archiveThreshold:     0.65,
    filterThreshold:      0.80,
    unsubscribeThreshold: 0.80,
  },
  aggressive: {
    archiveThreshold:     0.50,
    filterThreshold:      0.70,
    unsubscribeThreshold: 0.70,
  },
};

// ---------------------------------------------------------------------------
// Recency protection decay
// ---------------------------------------------------------------------------

function recencyProtection(lastEngagedAt: string | null): number {
  if (!lastEngagedAt) return 0;

  const daysAgo = (Date.now() - new Date(lastEngagedAt).getTime()) / 86_400_000;

  if (daysAgo <= 14)  return -0.50;  // strong protection
  if (daysAgo <= 30)  return -0.25;  // moderate
  if (daysAgo <= 90)  return -0.10;  // weak
  return 0;                          // no protection — stale engagement
}

// ---------------------------------------------------------------------------
// Core scoring function
// ---------------------------------------------------------------------------

export function computeSenderJunkScore(sender: SenderScoringInput): JunkScoreResult {
  const signals: string[] = [];

  // Don't score senders with explicit user overrides
  if (sender.learned_state === "always_keep") {
    return { score: 0, ignore_rate: 0, reply_rate: 0, recency_protection: 0, signals: ["user_override_keep"] };
  }
  if (sender.learned_state === "always_archive") {
    return { score: 1, ignore_rate: 1, reply_rate: 0, recency_protection: 0, signals: ["user_override_archive"] };
  }

  // Need at least 2 messages to score meaningfully
  if (sender.message_count < 2) {
    return { score: 0.3, ignore_rate: 0, reply_rate: 0, recency_protection: 0, signals: ["too_few_messages"] };
  }

  const mc = sender.message_count;

  // ── Component 1: Ignore rate (40% weight) ───────────────────────────────
  // How many emails from this sender were never opened
  const ignore_rate = mc > 0 ? Math.max(0, (mc - sender.open_count) / mc) : 0;
  const ignoreSignal = ignore_rate * 0.4;
  if (ignore_rate > 0.80) signals.push(`${Math.round(ignore_rate * 100)}% ignored`);

  // ── Component 2: No-reply rate (30% weight) ─────────────────────────────
  const reply_rate = mc > 0 ? sender.reply_count / mc : 0;
  const noReplySignal = (1 - reply_rate) * 0.3;

  // ── Component 3: Category signal (20% weight) ──────────────────────────
  const JUNK_CATEGORIES = new Set(["promotion", "newsletter", "spam_like", "recurring_low_value"]);
  const categorySignal = sender.dominant_category && JUNK_CATEGORIES.has(sender.dominant_category)
    ? 0.2
    : 0;
  if (categorySignal > 0) signals.push(`category: ${sender.dominant_category}`);

  // ── Component 4: Unsubscribe header presence (10% weight) ──────────────
  const unsubSignal = sender.has_unsubscribe ? 0.1 : 0;
  if (sender.has_unsubscribe) signals.push("has unsubscribe");

  // ── Recency protection (negative weight) ───────────────────────────────
  const recency = recencyProtection(sender.last_engaged_at);
  if (recency < 0) signals.push(`recent engagement (${Math.abs(recency)} protection)`);

  // ── Reply history penalty (strong negative weight) ─────────────────────
  const replyPenalty = reply_rate * -0.7;
  if (reply_rate > 0.05) signals.push(`${Math.round(reply_rate * 100)}% reply rate`);

  // ── Restore penalty — user explicitly rescued emails from this sender ──
  const restorePenalty = sender.restore_count > 0 ? -0.3 : 0;
  if (sender.restore_count > 0) signals.push(`${sender.restore_count} restores`);

  // ── Final score ─────────────────────────────────────────────────────────
  const rawScore = ignoreSignal + noReplySignal + categorySignal + unsubSignal
                 + recency + replyPenalty + restorePenalty;

  const score = Math.max(0, Math.min(1, rawScore));

  return {
    score,
    ignore_rate,
    reply_rate,
    recency_protection: recency,
    signals,
  };
}
