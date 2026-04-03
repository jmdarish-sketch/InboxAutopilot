import type { FinalDecision } from "@/lib/classification/final-decision";

// ---------------------------------------------------------------------------
// AutopilotMode — mirrors users.autopilot_mode column values
// ---------------------------------------------------------------------------

export type AutopilotMode = "suggest_only" | "safe" | "aggressive";

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
// Takes the final classification result and the user's autopilot mode and
// returns a concrete execution decision.
//
// The sender's restore_count is passed in directly so callers don't need to
// import the full SenderRecord just for this one field.
//
// Mode behaviour:
//   suggest_only  — never auto-archives; everything that isn't clearly important
//                   goes to the review queue for the user to decide.
//   safe          — auto-archives only when confidence ≥ 0.90 and the sender
//                   has never been restored from archive (restore_count === 0).
//   aggressive    — auto-archives when confidence ≥ 0.80, regardless of
//                   restore history.
// ---------------------------------------------------------------------------

export function decideAutopilotExecution(
  final:          FinalDecision,
  senderRestore:  number,   // sender.restore_count
  mode:           AutopilotMode
): ExecutionDecision {

  // ── Messages the classifier wants to keep in inbox ───────────────────────
  // These are never touched regardless of mode — keep_inbox is always honoured.
  if (final.recommendedAction === "keep_inbox") {
    return { type: "keep_inbox", reason: "important_or_protected" };
  }

  // ── Messages the classifier flags for user review ─────────────────────────
  // Uncertain results go to the queue in all modes.
  if (final.recommendedAction === "review") {
    return { type: "queue_review", reason: "uncertain_classification" };
  }

  // ── digest_only — treat the same as archive with a labelling note ─────────
  // V1 doesn't have a true digest label mechanism yet; surface in review queue
  // so the user can see it. The action_reason preserves the original intent.
  if (final.recommendedAction === "digest_only") {
    if (mode === "suggest_only") {
      return { type: "queue_review", reason: "suggest_mode_digest_only" };
    }
    return { type: "auto_archive", reason: "digest_only_archive" };
  }

  // ── Messages the classifier wants to archive ─────────────────────────────
  if (final.recommendedAction === "archive") {

    // Mode: suggest only — never takes automatic action
    if (mode === "suggest_only") {
      return { type: "queue_review", reason: "suggest_mode_no_auto_actions" };
    }

    // Mode: safe — archive only when highly confident and never restored
    if (mode === "safe") {
      if (final.confidenceScore >= 0.9 && senderRestore === 0) {
        return { type: "auto_archive", reason: "safe_mode_high_confidence" };
      }
      return { type: "queue_review", reason: "safe_mode_not_confident_enough" };
    }

    // Mode: aggressive — archive when sufficiently confident
    if (mode === "aggressive") {
      if (final.confidenceScore >= 0.8) {
        return { type: "auto_archive", reason: "aggressive_mode_threshold_met" };
      }
      return { type: "queue_review", reason: "aggressive_mode_still_uncertain" };
    }
  }

  // ── Fallback — should not normally be reached ────────────────────────────
  return { type: "queue_review", reason: "default_fallback" };
}
