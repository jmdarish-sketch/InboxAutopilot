/**
 * lib/autopilot/learning.ts
 *
 * The preference-learning engine.  This is the product moat.
 *
 * Every user action (open, reply, archive, restore, unsubscribe, rule change)
 * flows through recordFeedbackAndRetrain(), which:
 *   1. Writes an immutable feedback_events row (the training log).
 *   2. Recomputes the sender's importance_score, clutter_score, and
 *      learned_state using a time-decayed recount of ALL past events
 *      for that sender — not just a simple ±N nudge.
 *
 * Time decay design (§7.5):
 *   - Exponential decay with a 21-day half-life.
 *   - An event from yesterday has full weight; one from 6 months ago
 *     contributes ~3 % of its original weight.
 *   - This lets the system adapt quickly when a user's behaviour changes
 *     (e.g., starts ignoring a sender they used to open, or vice-versa).
 *   - Hard overrides (always_keep / always_archive) bypass the computation
 *     entirely — the user has made an explicit, permanent decision.
 *
 * Canonical module.  lib/review/learning.ts re-exports from here.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Score weight halves every HALF_LIFE_DAYS days.  21 days ≈ 3 weeks. */
const HALF_LIFE_DAYS = 21;

/** Starting point before any events are applied.  50/50 = genuinely unknown. */
const NEUTRAL_IMPORTANCE = 50;
const NEUTRAL_CLUTTER    = 50;

/**
 * Per-event importance / clutter deltas (§3.14).
 * Additional event types beyond §3.14 are included for completeness —
 * they all appear in the feedback_events.event_type enum.
 */
const EVENT_DELTAS: Record<string, { importance: number; clutter: number }> = {
  // Core §3.14 events
  email_opened:          { importance: +5,  clutter: -3  },
  email_replied:         { importance: +15, clutter: -8  },
  email_restored:        { importance: +20, clutter: -10 },
  email_archived_manual: { importance: -2,  clutter: +5  },
  unsubscribe_confirmed: { importance: -10, clutter: +20 },

  // Additional engagement signals
  email_clicked:          { importance: +3,  clutter: -2  },
  email_marked_important: { importance: +8,  clutter: -4  },
  search_for_sender:      { importance: +5,  clutter: -3  },
  review_keep:            { importance: +3,  clutter: -2  },
  review_archive:         { importance: -2,  clutter: +3  },
};

/** How far back to look when recomputing scores. */
const RECOMPUTE_WINDOW_DAYS = 90;

/** Minimum events in the window before we trust the decay computation.
 *  Below this threshold, fall back to the simple incremental nudge so
 *  a sender with 1 event doesn't land at an extreme score. */
const MIN_EVENTS_FOR_DECAY = 3;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function decayWeight(daysAgo: number): number {
  // 2^(-daysAgo / HALF_LIFE_DAYS)
  return Math.pow(2, -daysAgo / HALF_LIFE_DAYS);
}

// ---------------------------------------------------------------------------
// SenderSnapshot — the minimal sender columns this module reads / writes
// ---------------------------------------------------------------------------

interface SenderSnapshot {
  importance_score: number;
  clutter_score:    number;
  review_required:  boolean;
  learned_state:    string;
}

// ---------------------------------------------------------------------------
// recomputeSenderState  (§3.14)
//
// Synchronous, instant-delta version.  Used as the fallback when we don't
// have enough historical events yet, and exposed so callers can compute
// a preview without hitting the DB.
// ---------------------------------------------------------------------------

export function recomputeSenderState(
  sender:    SenderSnapshot,
  eventType: string
): Partial<SenderSnapshot> {
  // ── Hard overrides bypass all computation ───────────────────────────────
  if (eventType === "sender_keep_forever") {
    return {
      learned_state:    "always_keep",
      importance_score: 100,
      clutter_score:    0,
      review_required:  false,
    };
  }
  if (eventType === "sender_archive_forever") {
    return {
      learned_state:    "always_archive",
      importance_score: 0,
      clutter_score:    100,
      review_required:  false,
    };
  }

  let importance    = Number(sender.importance_score);
  let clutter       = Number(sender.clutter_score);
  let reviewRequired = sender.review_required;

  const deltas = EVENT_DELTAS[eventType];
  if (deltas) {
    importance += deltas.importance;
    clutter    += deltas.clutter;
  }

  // email_restored additionally flags review_required
  if (eventType === "email_restored") reviewRequired = true;

  importance = clamp(importance, 0, 100);
  clutter    = clamp(clutter,    0, 100);

  let learnedState = "unknown";
  if (importance >= 80)                 learnedState = "prefer_keep";
  if (clutter >= 80 && importance < 30) learnedState = "prefer_archive";

  return {
    importance_score: importance,
    clutter_score:    clutter,
    learned_state:    learnedState,
    review_required:  reviewRequired,
  };
}

// ---------------------------------------------------------------------------
// computeDecayedScores
//
// Given a list of historical feedback_events (already fetched), computes
// time-decayed importance and clutter scores from scratch.
//
// Algorithm:
//   - Start at neutral (NEUTRAL_IMPORTANCE, NEUTRAL_CLUTTER).
//   - For each event, apply its delta × decayWeight(daysAgo).
//   - Clamp result to [0, 100].
//
// This means a sender with identical positive events 1 day vs 90 days ago
// will have a much higher score for the recent one — old patterns fade.
// ---------------------------------------------------------------------------

interface FeedbackEventRow {
  event_type:  string;
  created_at:  string;
}

function computeDecayedScores(
  events: FeedbackEventRow[]
): { importance: number; clutter: number } {
  const now = Date.now();
  let importanceDelta = 0;
  let clutterDelta    = 0;

  for (const event of events) {
    const deltas = EVENT_DELTAS[event.event_type];
    if (!deltas) continue;

    const msAgo   = now - new Date(event.created_at).getTime();
    const daysAgo = msAgo / (1000 * 60 * 60 * 24);
    const weight  = decayWeight(Math.max(0, daysAgo));

    importanceDelta += deltas.importance * weight;
    clutterDelta    += deltas.clutter    * weight;
  }

  return {
    importance: clamp(NEUTRAL_IMPORTANCE + importanceDelta, 0, 100),
    clutter:    clamp(NEUTRAL_CLUTTER    + clutterDelta,    0, 100),
  };
}

// ---------------------------------------------------------------------------
// computeRecentEngagementBoost
//
// Returns a 0–1 score reflecting how actively the user has engaged with
// this sender in the last 30 days.  Used by:
//   - The classification scorer (via lib/classification/features.ts)
//   - The autopilot to decide whether to be more cautious about archiving
//
// Only counts positive-engagement events (open, reply, click, etc.).
// Weighted by recency using the same decay function as the main scorer.
// ---------------------------------------------------------------------------

export async function computeRecentEngagementBoost(
  supabaseUserId: string,
  senderId:        string
): Promise<number> {
  const supabase = createAdminClient();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const POSITIVE_EVENTS = new Set([
    "email_opened", "email_replied", "email_clicked",
    "email_marked_important", "email_restored", "search_for_sender",
    "review_keep",
  ]);

  type EvRow = { event_type: string; created_at: string };

  const { data: events } = await supabase
    .from("feedback_events")
    .select("event_type, created_at")
    .eq("user_id",  supabaseUserId)
    .eq("sender_id", senderId)
    .gte("created_at", since) as unknown as { data: EvRow[] | null };

  if (!events?.length) return 0;

  const now = Date.now();
  let weightedSum = 0;
  let maxPossible = 0;

  for (const ev of events) {
    if (!POSITIVE_EVENTS.has(ev.event_type)) continue;

    const daysAgo = (now - new Date(ev.created_at).getTime()) / 86_400_000;
    const weight  = decayWeight(Math.max(0, daysAgo));
    weightedSum  += weight;
    maxPossible  += 1; // unweighted count as normaliser ceiling
  }

  if (maxPossible === 0) return 0;

  // Normalise to [0, 1] using raw count as ceiling so one very-recent
  // open doesn't immediately return 1.0
  return clamp(weightedSum / maxPossible, 0, 1);
}

// ---------------------------------------------------------------------------
// recordFeedbackAndRetrain  (§3.14 + §7.5)
//
// Main entry point.  Called from every user-action path in the app.
//
// Execution order:
//   1. Insert an immutable feedback_events row.
//   2. If no senderId: done (message-level event, no sender to update).
//   3. Hard overrides (keep_forever / archive_forever): apply immediately.
//   4. Otherwise:
//      a. Fetch up to RECOMPUTE_WINDOW_DAYS of events for this sender.
//      b. If enough events (≥ MIN_EVENTS_FOR_DECAY): use time-decayed
//         full recomputation (computeDecayedScores).
//      c. If too few events: fall back to incremental nudge
//         (recomputeSenderState) so a brand-new sender isn't immediately
//         pushed to an extreme by a single event.
//      d. Write the resulting scores back to the senders table.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// computeBehaviorScore
//
// Computes a single behavior score from sender engagement counters.
// Positive = user cares, negative = user ignores.
//
// Returns the numeric score AND the recommended learned_state transition.
// ---------------------------------------------------------------------------

export interface BehaviorScoreResult {
  score:          number;
  recommendedState: string;
  previousState:    string;
  crossed:          boolean; // true if state actually changed
}

export function computeBehaviorScore(sender: {
  open_count:     number;
  reply_count:    number;
  restore_count:  number;
  ignore_count:   number;
  archive_count:  number;
  learned_state:  string;
}): BehaviorScoreResult {
  const score =
    (sender.open_count    * 3)  +
    (sender.reply_count   * 5)  +
    (sender.restore_count * 4)  +
    (sender.ignore_count  * -1) +
    (sender.archive_count * -1);

  let recommendedState: string;
  if (score < -15)       recommendedState = "always_archive";
  else if (score < -5)   recommendedState = "prefer_archive";
  else if (score <= 5)   recommendedState = "unknown";
  else if (score <= 20)  recommendedState = "prefer_keep";
  else                   recommendedState = "always_keep";

  // Don't demote hard user overrides
  const isHardOverride =
    sender.learned_state === "always_keep" ||
    sender.learned_state === "always_archive";

  return {
    score,
    recommendedState: isHardOverride ? sender.learned_state : recommendedState,
    previousState:    sender.learned_state,
    crossed:          !isHardOverride && recommendedState !== sender.learned_state,
  };
}

// ---------------------------------------------------------------------------
// recordFeedbackAndRetrain  (§3.14 + §7.5)
// ---------------------------------------------------------------------------

export async function recordFeedbackAndRetrain(
  supabaseUserId: string,
  eventType:      string,
  options: {
    senderId?:   string;
    messageId?:  string;
    eventValue?: string;
  } = {}
): Promise<void> {
  const supabase = createAdminClient();

  // ── 1. Insert immutable feedback event ──────────────────────────────────
  await supabase.from("feedback_events").insert({
    user_id:     supabaseUserId,
    sender_id:   options.senderId  ?? null,
    message_id:  options.messageId ?? null,
    event_type:  eventType,
    event_value: options.eventValue ?? null,
  });

  // ── 2. Nothing more to do without a sender ───────────────────────────────
  if (!options.senderId) return;

  const senderId = options.senderId;

  // ── 2b. Update last_engaged_at for engagement events ────────────────────
  const ENGAGEMENT_EVENTS = new Set([
    "email_opened", "email_replied", "email_clicked",
    "email_marked_important", "email_restored", "search_for_sender",
    "review_keep", "sender_keep_forever",
  ]);

  if (ENGAGEMENT_EVENTS.has(eventType)) {
    await supabase
      .from("senders")
      .update({ last_engaged_at: new Date().toISOString() })
      .eq("id", senderId);
  }

  // ── 3. Hard overrides — bypass decay computation ─────────────────────────
  if (eventType === "sender_keep_forever") {
    await supabase
      .from("senders")
      .update({
        learned_state:    "always_keep",
        importance_score: 100,
        clutter_score:    0,
        review_required:  false,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", senderId);
    return;
  }

  if (eventType === "sender_archive_forever") {
    await supabase
      .from("senders")
      .update({
        learned_state:    "always_archive",
        importance_score: 0,
        clutter_score:    100,
        review_required:  false,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", senderId);
    return;
  }

  // ── 4. Fetch current sender state + recent event history in parallel ─────
  type SenderRow = {
    importance_score: number;
    clutter_score:    number;
    review_required:  boolean;
    learned_state:    string;
  };
  type EvRow = { event_type: string; created_at: string };

  const since = new Date(
    Date.now() - RECOMPUTE_WINDOW_DAYS * 86_400_000
  ).toISOString();

  const [senderRes, eventsRes] = await Promise.all([
    supabase
      .from("senders")
      .select("importance_score, clutter_score, review_required, learned_state")
      .eq("id", senderId)
      .single() as unknown as Promise<{ data: SenderRow | null }>,

    supabase
      .from("feedback_events")
      .select("event_type, created_at")
      .eq("user_id",   supabaseUserId)
      .eq("sender_id", senderId)
      .gte("created_at", since)
      .order("created_at", { ascending: true }) as unknown as Promise<{ data: EvRow[] | null }>,
  ]);

  const sender = senderRes.data;
  if (!sender) return; // sender deleted between steps

  // ── 5. Skip recompute if sender has an explicit hard override ────────────
  if (
    sender.learned_state === "always_keep" ||
    sender.learned_state === "always_archive"
  ) {
    return;
  }

  const recentEvents = eventsRes.data ?? [];

  // ── 6. Compute updated scores ────────────────────────────────────────────
  let updates: Partial<SenderRow>;

  if (recentEvents.length >= MIN_EVENTS_FOR_DECAY) {
    // Full time-decayed recomputation — the canonical path
    const { importance, clutter } = computeDecayedScores(recentEvents);

    let learnedState = "unknown";
    if (importance >= 80)                  learnedState = "prefer_keep";
    if (clutter >= 80 && importance < 30)  learnedState = "prefer_archive";

    updates = {
      importance_score: parseFloat(importance.toFixed(2)),
      clutter_score:    parseFloat(clutter.toFixed(2)),
      learned_state:    learnedState,
      // Preserve review_required: only set true, never clear it here
      // (clearing happens on explicit reset / keep_forever)
      review_required:  sender.review_required ||
                        eventType === "email_restored",
    };
  } else {
    // Fallback: incremental nudge for senders with very little history
    updates = recomputeSenderState(
      {
        importance_score: Number(sender.importance_score),
        clutter_score:    Number(sender.clutter_score),
        review_required:  sender.review_required,
        learned_state:    sender.learned_state,
      },
      eventType
    );
  }

  // ── 7. Persist ──────────────────────────────────────────────────────────
  await supabase
    .from("senders")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", senderId);
}
