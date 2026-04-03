import type { NormalizedMessage } from "@/lib/gmail/types";
import type { MessageFeatures, SenderRecord } from "./features";
import type { DeterministicResult } from "./rules";

// ---------------------------------------------------------------------------
// ScoredResult — output of scoreMessage, input to the LLM gate (§3.6).
// ---------------------------------------------------------------------------

export interface ScoredResult {
  importanceScore: number; // 0–100
  clutterScore: number;    // 0–100
  riskScore: number;       // 0–100, higher = more dangerous to archive
  confidence: number;      // 0–1
}

// ---------------------------------------------------------------------------
// scoreMessage (§3.5)
//
// Second classification layer. Takes the deterministic result as a baseline
// and adjusts all three scores using sender engagement rates and message
// signals. All scores are clamped to [0, 100] before returning.
//
// Weight rationale:
//
//   IMPORTANCE
//     senderReplyRate   × 40  — replies are the strongest intentional signal
//     senderOpenRate    × 25  — opens are meaningful but noisier
//     senderSearchRate  × 20  — searching for a sender signals they matter
//     recentEngagementBoost   — small recency nudge (0–1 raw, see features.ts)
//     isStarred         + 20  — explicit user action
//     isImportantLabel  + 12  — Gmail's own importance marker
//
//   CLUTTER
//     senderArchiveRate × 30  — user consistently archives → clutter
//     hasUnsubscribeHeader+10 — bulk mail structural signal
//     promoTerms        × 8   — per-term accumulation
//     newsletterTerms   × 7   — per-term accumulation
//     noreplyLike       + 8   — automated sender pattern
//     always_archive    + 25  — explicit user preference
//
//   RISK (cost of archiving by mistake)
//     senderRestoreRate × 35  — user has rescued this sender before
//     isNewSender       + 15  — unknown pattern = uncertain
//     fromImportantDomain+20  — bank/gov/healthcare → high-stakes
//     transactionalTerms+ 20  — financial/transactional content
//     securityTerms     + 30  — security content must never be buried
//     always_keep       + 30  — explicit user preference
// ---------------------------------------------------------------------------

export function scoreMessage(
  msg: NormalizedMessage,
  sender: SenderRecord,
  f: MessageFeatures,
  deterministic: DeterministicResult
): ScoredResult {
  let importance = deterministic.importanceScore;
  let clutter    = deterministic.clutterScore;
  let risk       = deterministic.riskScore;

  // ── Importance adjustments ───────────────────────────────────────────────
  importance += f.senderReplyRate   * 40;
  importance += f.senderOpenRate    * 25;
  importance += f.senderSearchRate  * 20;
  importance += f.recentEngagementBoost;         // 0–1 raw, intentionally small
  importance += msg.is_starred        ? 20 : 0;
  importance += msg.is_important_label ? 12 : 0;

  // ── Clutter adjustments ──────────────────────────────────────────────────
  clutter += f.senderArchiveRate          * 30;
  clutter += f.hasUnsubscribeHeader       ? 10 : 0;
  clutter += f.promoTerms                 * 8;
  clutter += f.newsletterTerms            * 7;
  clutter += f.noreplyLike               ? 8  : 0;
  clutter += sender.learned_state === "always_archive" ? 25 : 0;

  // ── Risk adjustments ─────────────────────────────────────────────────────
  risk += f.senderRestoreRate             * 35;
  risk += f.isNewSender                   ? 15 : 0;
  risk += f.fromImportantDomain           ? 20 : 0;
  risk += f.transactionalTerms > 0        ? 20 : 0;
  risk += f.securityTerms > 0             ? 30 : 0;
  risk += sender.learned_state === "always_keep" ? 30 : 0;

  // ── Clamp all scores to [0, 100] ─────────────────────────────────────────
  importance = clamp(importance, 0, 100);
  clutter    = clamp(clutter,    0, 100);
  risk       = clamp(risk,       0, 100);

  const confidence = computeConfidence(deterministic, f, sender);

  return { importanceScore: importance, clutterScore: clutter, riskScore: risk, confidence };
}

// ---------------------------------------------------------------------------
// computeConfidence
//
// Not specified in §3.5 — designed here to produce values that work correctly
// with the LLM gate thresholds in §3.6:
//   confidence > 0.85  →  skip LLM (high confidence)
//   confidence < 0.70  →  use LLM  (low confidence)
//
// Strategy: start from the deterministic confidence (the most reliable anchor)
// and apply adjustments that reflect how much context we have about this sender
// and how coherent the signals are.
//
// Key calibration targets:
//   - "uncertain" fallback (baseline 0.30) stays below 0.70 even with a
//     well-known sender → always goes to LLM unless learned_state is explicit
//     (that case is caught earlier in shouldUseLLM with an early return).
//   - High-confidence deterministic results (0.84–0.97) stay above 0.85
//     for clean signals, but drop below when signals are contradictory or
//     the sender is new.
//   - Security results (0.97) survive all penalties above 0.70, matching
//     the riskScore > 80 early return in shouldUseLLM.
// ---------------------------------------------------------------------------

function computeConfidence(
  deterministic: DeterministicResult,
  f: MessageFeatures,
  sender: SenderRecord
): number {
  let confidence = deterministic.confidence;

  // ── Signal consistency ───────────────────────────────────────────────────
  // Mixed signals undermine whatever the deterministic rule decided.
  // e.g. a promo email from a domain the user replies to often.
  const hasClutterSignal =
    f.hasUnsubscribeHeader || f.promoTerms > 0 || f.noreplyLike;
  const hasImportanceSignal =
    f.securityTerms > 0 ||
    f.transactionalTerms > 0 ||
    f.fromImportantDomain ||
    f.senderReplyRate > 0.2;

  if (hasClutterSignal && hasImportanceSignal) confidence -= 0.08;

  // Strong multi-signal agreement on the clutter side boosts confidence.
  if (f.promoTerms >= 3 && f.hasUnsubscribeHeader && f.noreplyLike) {
    confidence += 0.04;
  }

  // ── Sender history depth ─────────────────────────────────────────────────
  // More messages from this sender → better-calibrated engagement rates.
  if (sender.message_count >= 10) {
    confidence += 0.04;
  } else if (sender.message_count >= 3) {
    confidence += 0.02;
  }

  // New sender: engagement rates are 0 or near-0 (unreliable), pattern unknown.
  if (f.isNewSender) confidence -= 0.10;

  // ── Explicit learned state ───────────────────────────────────────────────
  // User has already made a clear decision about this sender — we don't need
  // the LLM to speculate.
  if (
    sender.learned_state === "always_keep" ||
    sender.learned_state === "always_archive"
  ) {
    confidence += 0.08;
  } else if (
    sender.learned_state === "prefer_keep" ||
    sender.learned_state === "prefer_archive"
  ) {
    confidence += 0.04;
  }

  // ── Recent engagement ────────────────────────────────────────────────────
  // If the user has engaged with this sender recently, we have fresh signal.
  if (f.recentEngagementBoost > 0.3) confidence += 0.05;

  // ── Clamp to a meaningful range ──────────────────────────────────────────
  // Floor at 0.10: never output zero — there's always some signal.
  // Ceiling at 0.99: never claim certainty; leave room for the safety layer.
  return clamp(confidence, 0.10, 0.99);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
