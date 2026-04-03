import type { NormalizedMessage } from "@/lib/gmail/types";
import type { MessageFeatures } from "./features";

// ---------------------------------------------------------------------------
// Shared category and action enums — match the values in the messages table.
// Defined here and re-exported so downstream layers (scoring, LLM gate) share
// the same types without an extra import chain.
// ---------------------------------------------------------------------------

export type MessageCategory =
  | "critical_transactional"
  | "personal_human"
  | "work_school"
  | "recurring_useful"
  | "recurring_low_value"
  | "promotion"
  | "newsletter"
  | "spam_like"
  | "uncertain";

export type RecommendedAction =
  | "keep_inbox"
  | "archive"
  | "unsubscribe"
  | "mute_thread"
  | "digest_only"
  | "review"
  | "none";

export type DeterministicReason =
  | "security_terms_detected"
  | "transactional_terms_detected"
  | "school_or_work_sender"
  | "promo_language"
  | "unsubscribe_header_present"
  | "newsletter_structure_detected"
  | "no_deterministic_rule";

// ---------------------------------------------------------------------------
// DeterministicResult — output of classifyDeterministically.
// Consumed by the scoring layer (3.5) and, when category is "uncertain",
// passed through to the LLM gate (3.6).
// ---------------------------------------------------------------------------

export interface DeterministicResult {
  category: MessageCategory;
  importanceScore: number; // 0–100
  clutterScore: number;    // 0–100
  riskScore: number;       // 0–100, higher = more dangerous to archive
  action: RecommendedAction;
  confidence: number;      // 0–1
  reasons: DeterministicReason[];
}

// ---------------------------------------------------------------------------
// classifyDeterministically
//
// First classification layer — runs before any ML or LLM call.
// Rules are ordered from highest-stakes to lowest. A rule fires and returns
// immediately; no rule combines or overrides another.
//
// Rule order (from CLAUDE.md §3.4):
//   1. Security signal   → critical_transactional / keep_inbox   (conf 0.97)
//   2. Transactional     → critical_transactional / keep_inbox   (conf 0.93)
//   3. Work / school     → work_school / keep_inbox              (conf 0.90)
//   4. Promo + unsub     → promotion / archive                   (conf 0.88)
//   5. Newsletter + unsub → newsletter / archive                 (conf 0.84)
//   fallback             → uncertain / review                    (conf 0.30)
// ---------------------------------------------------------------------------

export function classifyDeterministically(
  _msg: NormalizedMessage,
  f: MessageFeatures
): DeterministicResult {
  // Rule 1 — Security signal
  // Any security term present makes this high-risk to archive regardless of
  // other signals. Catches 2FA codes, password resets, login alerts.
  if (f.securityTerms > 0) {
    return {
      category: "critical_transactional",
      importanceScore: 95,
      clutterScore: 5,
      riskScore: 95,
      action: "keep_inbox",
      confidence: 0.97,
      reasons: ["security_terms_detected"],
    };
  }

  // Rule 2 — Transactional content
  // Requires > 1 transactional term to reduce false positives from incidental
  // words like "order" in a newsletter subject line.
  if (f.transactionalTerms > 1) {
    return {
      category: "critical_transactional",
      importanceScore: 88,
      clutterScore: 10,
      riskScore: 85,
      action: "keep_inbox",
      confidence: 0.93,
      reasons: ["transactional_terms_detected"],
    };
  }

  // Rule 3 — Work / school sender with matching content
  // Domain alone isn't enough — requires at least one work/school term so
  // that a work domain sending marketing doesn't get misclassified.
  if (f.fromSchoolOrWorkDomain && f.workSchoolTerms > 0) {
    return {
      category: "work_school",
      importanceScore: 85,
      clutterScore: 15,
      riskScore: 80,
      action: "keep_inbox",
      confidence: 0.9,
      reasons: ["school_or_work_sender"],
    };
  }

  // Rule 4 — Promotional with unsubscribe header
  // Two promo terms required alongside the unsubscribe header to avoid
  // flagging transactional emails that happen to mention a sale.
  if (f.hasUnsubscribeHeader && f.promoTerms >= 2) {
    return {
      category: "promotion",
      importanceScore: 15,
      clutterScore: 85,
      riskScore: 20,
      action: "archive",
      confidence: 0.88,
      reasons: ["promo_language", "unsubscribe_header_present"],
    };
  }

  // Rule 5 — Newsletter with unsubscribe header
  // One newsletter term is sufficient when paired with a List-Unsubscribe
  // header — that combination is a very reliable bulk-mail signal.
  if (f.hasUnsubscribeHeader && f.newsletterTerms >= 1) {
    return {
      category: "newsletter",
      importanceScore: 25,
      clutterScore: 70,
      riskScore: 25,
      action: "archive",
      confidence: 0.84,
      reasons: ["newsletter_structure_detected"],
    };
  }

  // Fallback — no rule fired. Passes to the scoring layer and, if still
  // uncertain after scoring, to the LLM gate.
  return {
    category: "uncertain",
    importanceScore: 50,
    clutterScore: 50,
    riskScore: 50,
    action: "review",
    confidence: 0.3,
    reasons: ["no_deterministic_rule"],
  };
}
