import type { NormalizedMessage } from "@/lib/gmail/types";
import type { SenderRecord } from "./features";
import type { DeterministicResult, MessageCategory, RecommendedAction } from "./rules";
import type { ScoredResult } from "./scorer";
import type { LLMDecision } from "./llm";

// ---------------------------------------------------------------------------
// FinalDecision — the output of the full classification pipeline.
// Written to messages.final_category, messages.recommended_action,
// messages.confidence_score, and messages.action_reason.
// ---------------------------------------------------------------------------

export interface FinalDecision {
  finalCategory: MessageCategory;
  recommendedAction: RecommendedAction;
  confidenceScore: number; // 0–1
  reason: string;
}

// ---------------------------------------------------------------------------
// resolveFinalClassification (§3.8)
//
// Terminal layer of the classification pipeline. Applies business rules on
// top of the three prior layers (deterministic, scored, LLM) to produce a
// single final decision.
//
// Resolution priority (highest → lowest):
//   1. Explicit sender preference (always_keep / always_archive)
//      → Overrides everything. User already made this decision.
//   2. High risk score (≥ 85)
//      → Safety first: never archive something this risky regardless of LLM.
//   3. LLM decision present
//      → Trust the LLM, but veto "archive" if riskScore > 60 (downgrade to review).
//   4. Score-only path — no LLM was called
//      a. High clutter + low importance + low risk → archive
//      b. High importance or elevated risk → keep_inbox
//   5. Fallback
//      → Genuinely ambiguous; surface for user review.
// ---------------------------------------------------------------------------

export function resolveFinalClassification(input: {
  parsed: NormalizedMessage;
  sender: SenderRecord;
  deterministic: DeterministicResult;
  scored: ScoredResult;
  llmDecision: LLMDecision | null;
}): FinalDecision {
  const { sender, deterministic, scored, llmDecision } = input;

  // ── 1. Explicit sender preference ────────────────────────────────────────
  // These are hard overrides set by the user or the system via feedback events.
  // The classification engine is not allowed to countermand them.
  if (sender.learned_state === "always_keep") {
    return {
      finalCategory: "recurring_useful",
      recommendedAction: "keep_inbox",
      confidenceScore: 0.99,
      reason: "user_or_system_sender_keep_rule",
    };
  }

  if (sender.learned_state === "always_archive") {
    return {
      finalCategory: "recurring_low_value",
      recommendedAction: "archive",
      confidenceScore: 0.98,
      reason: "user_or_system_sender_archive_rule",
    };
  }

  // ── 2. High risk — safety override ───────────────────────────────────────
  // riskScore ≥ 85 means archiving could hide something genuinely important
  // (security alert, financial notice, etc.). Force keep_inbox regardless of
  // what the scoring or LLM layers decided.
  if (scored.riskScore >= 85) {
    return {
      finalCategory:
        deterministic.category === "uncertain"
          ? "critical_transactional"
          : deterministic.category,
      recommendedAction: "keep_inbox",
      confidenceScore: Math.max(scored.confidence, 0.9),
      reason: "high_risk_protected",
    };
  }

  // ── 3. LLM decision ──────────────────────────────────────────────────────
  if (llmDecision) {
    // Safety veto: the LLM wants to archive but the scorer thinks it's risky.
    // Downgrade to review so the user makes the call.
    if (llmDecision.recommendedAction === "archive" && scored.riskScore > 60) {
      return {
        finalCategory: llmDecision.category,
        recommendedAction: "review",
        confidenceScore: 0.7,
        reason: "llm_archive_blocked_by_risk",
      };
    }

    return {
      finalCategory: llmDecision.category,
      recommendedAction: llmDecision.recommendedAction as RecommendedAction,
      confidenceScore: llmDecision.confidence,
      reason: llmDecision.explanationTags.join(","),
    };
  }

  // ── 4a. Score-only: high clutter + safe to archive ───────────────────────
  // All four conditions must hold simultaneously — this prevents a single
  // high clutter score from overriding signals that the message matters.
  if (
    scored.clutterScore    >= 75 &&
    scored.importanceScore <= 30 &&
    scored.riskScore       <= 35 &&
    scored.confidence      >= 0.8
  ) {
    return {
      finalCategory:
        deterministic.category === "uncertain"
          ? "recurring_low_value"
          : deterministic.category,
      recommendedAction: "archive",
      confidenceScore: scored.confidence,
      reason: "high_clutter_low_importance",
    };
  }

  // ── 4b. Score-only: clearly important or risky ───────────────────────────
  if (scored.importanceScore >= 70 || scored.riskScore >= 65) {
    return {
      finalCategory:
        deterministic.category === "uncertain"
          ? "recurring_useful"
          : deterministic.category,
      recommendedAction: "keep_inbox",
      confidenceScore: scored.confidence,
      reason: "importance_or_risk_above_threshold",
    };
  }

  // ── 5. Fallback ───────────────────────────────────────────────────────────
  // Scores are ambiguous and no LLM decision is available. Surface for review
  // so the user's response can feed back into preference learning.
  return {
    finalCategory: "uncertain",
    recommendedAction: "review",
    confidenceScore: scored.confidence,
    reason: "fell_between_thresholds",
  };
}
