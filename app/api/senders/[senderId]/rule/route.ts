import { auth, currentUser }           from "@clerk/nextjs/server";
import { NextRequest, NextResponse }    from "next/server";
import { createAdminClient }            from "@/lib/supabase/admin";
import { attemptUnsubscribe }           from "@/lib/gmail/actions";
import { recordFeedbackAndRetrain }     from "@/lib/review/learning";
import { setSenderRule }                from "@/lib/senders/set-rule";

type RuleAction =
  | "always_keep"
  | "always_archive"
  | "digest_only"
  | "always_review"
  | "try_unsubscribe"
  | "reset";

// Map rule actions to sender_rules.rule_action values
const RULE_ACTION_MAP: Partial<Record<RuleAction, string>> = {
  always_keep:    "always_keep",
  always_archive: "always_archive",
  digest_only:    "digest_only",
  always_review:  "always_review",
};

// Map to feedback event types for the learning loop
const FEEDBACK_MAP: Partial<Record<RuleAction, string>> = {
  always_keep:    "sender_keep_forever",
  always_archive: "sender_archive_forever",
  try_unsubscribe: "unsubscribe_confirmed",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ senderId: string }> }
) {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()]);
  if (!userId || !clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const supabaseUserId = user.id as string;

  let body: { action: RuleAction };
  try {
    body = (await req.json()) as { action: RuleAction };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { senderId } = await params;
  const { action }   = body;

  // Verify sender belongs to user
  const { data: sender } = await supabase
    .from("senders")
    .select("id, sender_email")
    .eq("id", senderId)
    .eq("user_id", supabaseUserId)
    .single();

  if (!sender) return NextResponse.json({ error: "Sender not found" }, { status: 404 });

  switch (action) {
    // ── Always keep / always archive / digest only / always review ────────
    case "always_keep":
    case "always_archive":
    case "digest_only":
    case "always_review": {
      const ruleAction = RULE_ACTION_MAP[action]!;
      await setSenderRule(supabaseUserId, senderId, ruleAction, "user_manual");

      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     senderId,
        action_type:   "rule_change",
        action_source: "user_manual",
        status:        "succeeded",
        reason:        action,
      });

      const feedbackEvent = FEEDBACK_MAP[action];
      if (feedbackEvent) {
        await recordFeedbackAndRetrain(supabaseUserId, feedbackEvent, { senderId });
      }
      break;
    }

    // ── Try unsubscribe ───────────────────────────────────────────────────
    case "try_unsubscribe": {
      const unsubResult = await attemptUnsubscribe(supabaseUserId, senderId);
      await setSenderRule(supabaseUserId, senderId, "always_archive", "user_manual");

      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     senderId,
        action_type:   "unsubscribe",
        action_source: "user_manual",
        status:        unsubResult.success ? "succeeded" : "succeeded",
        reason:        "user_manual_unsubscribe",
        metadata:      { unsubscribe_method: unsubResult.method, unsubscribe_attempted: unsubResult.attempted },
      });

      await recordFeedbackAndRetrain(supabaseUserId, "unsubscribe_confirmed", { senderId });
      break;
    }

    // ── Reset learned behavior ────────────────────────────────────────────
    case "reset": {
      // Deactivate all rules
      await supabase
        .from("sender_rules")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("user_id", supabaseUserId)
        .eq("sender_id", senderId);

      // Reset sender state
      await supabase
        .from("senders")
        .update({
          learned_state:   "unknown",
          review_required: false,
          updated_at:      new Date().toISOString(),
        })
        .eq("id", senderId);

      await supabase.from("actions_log").insert({
        user_id:       supabaseUserId,
        sender_id:     senderId,
        action_type:   "rule_change",
        action_source: "user_manual",
        status:        "succeeded",
        reason:        "reset_learned_behavior",
      });
      break;
    }
  }

  return NextResponse.json({ success: true });
}
