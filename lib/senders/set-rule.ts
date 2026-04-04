import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Centralized sender rule writer. Deactivates existing active rules for
 * the sender, then inserts one new active rule. Prevents duplicates.
 *
 * Use this from all call sites: onboarding cleanup, sender detail controls,
 * review resolution, recovery undo.
 */
export async function setSenderRule(
  userId: string,
  senderId: string,
  ruleAction: string,
  source: string
): Promise<void> {
  const supabase = createAdminClient();

  // Deactivate all existing active rules for this sender
  await supabase
    .from("sender_rules")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("sender_id", senderId)
    .eq("active", true);

  // Insert the new rule
  await supabase
    .from("sender_rules")
    .insert({
      user_id:     userId,
      sender_id:   senderId,
      rule_type:   "sender_exact",
      rule_action: ruleAction,
      source,
      active:      true,
    });
}
