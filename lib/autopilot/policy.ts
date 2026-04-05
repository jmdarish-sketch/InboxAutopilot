import type { FinalDecision } from "@/lib/classification/final-decision";

// ---------------------------------------------------------------------------
// AutopilotMode — mirrors users.autopilot_mode column values
// ---------------------------------------------------------------------------

export type AutopilotMode = "suggest_only" | "safe" | "balanced" | "aggressive";

// ---------------------------------------------------------------------------
// ExecutionDecision — what the autopilot will actually do with this message
// ---------------------------------------------------------------------------

export interface ExecutionDecision {
  type:   "keep_inbox" | "auto_archive" | "queue_review";
  reason: string;
}

// ---------------------------------------------------------------------------
// decideAutopilotExecution  (§3.13)
//
// Mode behaviour:
//   suggest_only  — never auto-archives; everything goes to review.
//   safe          — auto-archives at confidence ≥ 0.90, never-restored senders.
//   balanced      — auto-archives at confidence ≥ 0.80, never-restored senders.
//                   (NEW — the recommended default)
//   aggressive    — auto-archives at confidence ≥ 0.70, regardless of restores.
// ---------------------------------------------------------------------------

export function decideAutopilotExecution(
  final:          FinalDecision,
  senderRestore:  number,
  mode:           AutopilotMode
): ExecutionDecision {

  if (final.recommendedAction === "keep_inbox") {
    return { type: "keep_inbox", reason: "important_or_protected" };
  }

  if (final.recommendedAction === "review") {
    return { type: "queue_review", reason: "uncertain_classification" };
  }

  if (final.recommendedAction === "digest_only") {
    if (mode === "suggest_only") {
      return { type: "queue_review", reason: "suggest_mode_digest_only" };
    }
    return { type: "auto_archive", reason: "digest_only_archive" };
  }

  if (final.recommendedAction === "archive") {
    if (mode === "suggest_only") {
      return { type: "queue_review", reason: "suggest_mode_no_auto_actions" };
    }

    if (mode === "safe") {
      if (final.confidenceScore >= 0.9 && senderRestore === 0) {
        return { type: "auto_archive", reason: "safe_mode_high_confidence" };
      }
      return { type: "queue_review", reason: "safe_mode_not_confident_enough" };
    }

    if (mode === "balanced") {
      if (final.confidenceScore >= 0.8 && senderRestore === 0) {
        return { type: "auto_archive", reason: "balanced_mode_confident" };
      }
      return { type: "queue_review", reason: "balanced_mode_not_confident_enough" };
    }

    if (mode === "aggressive") {
      if (final.confidenceScore >= 0.7) {
        return { type: "auto_archive", reason: "aggressive_mode_threshold_met" };
      }
      return { type: "queue_review", reason: "aggressive_mode_still_uncertain" };
    }
  }

  return { type: "queue_review", reason: "default_fallback" };
}
