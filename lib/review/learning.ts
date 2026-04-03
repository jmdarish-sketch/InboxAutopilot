/**
 * lib/review/learning.ts
 *
 * Re-exports from the canonical learning module.
 * All imports of this path continue to work without changes.
 */
export {
  recomputeSenderState,
  computeRecentEngagementBoost,
  recordFeedbackAndRetrain,
} from "@/lib/autopilot/learning";
